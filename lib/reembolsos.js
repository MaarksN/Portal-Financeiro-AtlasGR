'use strict';

const { consultar, consultarUm, executar, emTransacao, lerJson } = require('../db');
const config = require('../config');
const politica = require('./politica');
const anexos = require('./anexos');
const espelho = require('./espelho');
const auditoria = require('./auditoria');
const { paraCentavos } = require('./dinheiro');
const { ErroApp, naoEncontrado, semPermissao } = require('./erros');
const { temPapel } = require('./usuarios');

// ------------------------------------------------------------------
// Reembolso por RELATÓRIO DE DESPESA, não por despesa solta.
//
// O funcionário monta um relatório ("Visita técnica — Curitiba"),
// lança N despesas dentro dele, anexa comprovante em cada uma e
// envia. O relatório inteiro sobe a cadeia de alçada de uma vez —
// uma viagem com 12 gastos vira 1 aprovação, não 12.
//
// Estados:
//   rascunho ──enviar──> em_aprovacao ──todos aprovam──> aprovado ──> pago
//                              │
//                              ├── rejeitar ──> rejeitado (fim)
//                              └── devolver ──> devolvido (volta a editar)
// ------------------------------------------------------------------

const EDITAVEIS = new Set(['rascunho', 'devolvido']);

const ESTADOS = Object.freeze({
  rascunho: 'Rascunho',
  em_aprovacao: 'Em aprovação',
  aprovado: 'Aprovado',
  pago: 'Pago',
  rejeitado: 'Rejeitado',
  devolvido: 'Devolvido para ajuste',
});

function proximoProtocolo() {
  const ano = new Date().getUTCFullYear();
  const prefixo = `RB-${ano}-`;
  const ultimo = consultarUm(
    'SELECT protocolo FROM relatorios WHERE protocolo LIKE ? ORDER BY protocolo DESC LIMIT 1',
    `${prefixo}%`,
  );
  const sequencia = ultimo ? Number(ultimo.protocolo.slice(prefixo.length)) + 1 : 1;
  return `${prefixo}${String(sequencia).padStart(4, '0')}`;
}

// ------------------------------ Leitura ------------------------------
function relatorioBruto(id) {
  const linha = consultarUm('SELECT * FROM relatorios WHERE id = ?', id);
  if (!linha) throw naoEncontrado('Relatório não encontrado.');
  return linha;
}

const podeAprovarAlgo = (usuario) => temPapel(usuario, 'coordenacao', 'gerencia', 'diretoria', 'financeiro');

function exigirAcesso(linha, usuario) {
  if (linha.solicitante_email === usuario.email) return;
  if (podeAprovarAlgo(usuario)) return;
  throw semPermissao('Este relatório é de outro solicitante.');
}

function exigirEdicao(linha, usuario) {
  if (linha.solicitante_email !== usuario.email && !temPapel(usuario, 'admin')) {
    throw semPermissao('Só o solicitante edita o próprio relatório.');
  }
  if (!EDITAVEIS.has(linha.estado)) {
    throw new ErroApp(
      `Relatório em "${ESTADOS[linha.estado]}" não pode ser editado.`,
      { status: 409, codigo: 'estado_invalido' },
    );
  }
}

const paraApi = (linha) => ({
  id: linha.id,
  protocolo: linha.protocolo,
  titulo: linha.titulo,
  solicitante: linha.solicitante_email,
  centroCusto: linha.centro_custo,
  periodoInicio: linha.periodo_inicio,
  periodoFim: linha.periodo_fim,
  estado: linha.estado,
  estadoRotulo: ESTADOS[linha.estado] || linha.estado,
  totalCentavos: linha.total_centavos,
  totalAprovadoCentavos: linha.total_aprovado_centavos,
  nivelAtual: linha.nivel_atual,
  enviadoEm: linha.enviado_em,
  decididoEm: linha.decidido_em,
  pagoEm: linha.pago_em,
  criadoEm: linha.criado_em,
  atualizadoEm: linha.atualizado_em,
  editavel: EDITAVEIS.has(linha.estado),
});

const despesaParaApi = (linha, comprovantes) => ({
  id: linha.id,
  data: linha.data,
  categoria: linha.categoria,
  descricao: linha.descricao,
  fornecedor: linha.fornecedor,
  projeto: linha.projeto,
  valorCentavos: linha.valor_centavos,
  justificativa: linha.justificativa,
  alertas: lerJson(linha.alertas, []),
  anexos: comprovantes,
});

// ------------------------- Cálculo e política -------------------------
// Recalcula total, período e alertas do relatório inteiro. Chamado
// depois de qualquer mexida em despesa ou anexo — é a única fonte de
// verdade dos alertas, para tela e envio nunca discordarem.
function recalcular(relatorioId) {
  const despesas = consultar('SELECT * FROM despesas WHERE relatorio_id = ? ORDER BY data, id', relatorioId);
  const comprovantesPorDespesa = anexos.contarPorDespesa(relatorioId);

  let total = 0;
  for (const despesa of despesas) {
    total += despesa.valor_centavos;
    const alertas = politica.avaliarDespesa(despesa, {
      irmas: despesas,
      temComprovante: (comprovantesPorDespesa.get(despesa.id) || 0) > 0,
    });
    executar('UPDATE despesas SET alertas = ?, atualizado_em = datetime(\'now\') WHERE id = ?',
      JSON.stringify(alertas), despesa.id);
  }

  const datas = despesas.map((d) => d.data).sort();
  executar(
    `UPDATE relatorios
        SET total_centavos = ?, periodo_inicio = ?, periodo_fim = ?, atualizado_em = datetime('now')
      WHERE id = ?`,
    total,
    datas[0] || null,
    datas.at(-1) || null,
    relatorioId,
  );

  return total;
}

function obter(id, usuario) {
  const linha = relatorioBruto(id);
  exigirAcesso(linha, usuario);

  const despesas = consultar('SELECT * FROM despesas WHERE relatorio_id = ? ORDER BY data, id', id);
  const relatorio = paraApi(linha);

  relatorio.despesas = despesas.map((d) => despesaParaApi(d, anexos.daDespesa(d.id)));
  relatorio.anexosSoltos = consultar('SELECT * FROM anexos WHERE relatorio_id = ? AND despesa_id IS NULL', id)
    .map(anexos.paraApi);
  relatorio.cadeia = consultar(
    'SELECT * FROM aprovacoes WHERE relatorio_id = ? ORDER BY ordem',
    id,
  ).map((a) => ({
    nivel: a.nivel,
    rotulo: a.rotulo,
    ordem: a.ordem,
    estado: a.estado,
    decisor: a.decisor_email,
    comentario: a.comentario,
    decididoEm: a.decidido_em,
  }));

  // Cadeia projetada enquanto o relatório ainda é rascunho.
  if (!relatorio.cadeia.length) {
    relatorio.cadeiaPrevista = politica.cadeiaDeAlcada(linha.total_centavos);
  }
  relatorio.alcadaFinal = politica.alcadaFinal(linha.total_centavos);
  relatorio.alertas = relatorio.despesas.flatMap((d) =>
    d.alertas.map((a) => ({ ...a, despesaId: d.id, despesa: d.descricao || d.categoria })));
  relatorio.bloqueios = relatorio.alertas.filter((a) => a.bloqueia);
  relatorio.historico = auditoria.historicoDe('relatorio', id, 50);
  relatorio.podeDecidir = decisaoPendenteDe(linha, usuario) !== null;

  return relatorio;
}

function listar({ usuario, estado = null, todos = false }) {
  const condicoes = [];
  const parametros = [];

  const verTudo = todos && temPapel(usuario, 'financeiro', 'admin');
  if (!verTudo) {
    condicoes.push('solicitante_email = ?');
    parametros.push(usuario.email);
  }
  if (estado) {
    condicoes.push('estado = ?');
    parametros.push(estado);
  }

  const onde = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
  return consultar(
    `SELECT * FROM relatorios ${onde} ORDER BY datetime(atualizado_em) DESC LIMIT 200`,
    ...parametros,
  ).map(paraApi);
}

function resumoDe(usuario) {
  const linhas = consultar(
    `SELECT estado, count(*) AS total, sum(total_centavos) AS valor
       FROM relatorios WHERE solicitante_email = ? GROUP BY estado`,
    usuario.email,
  );
  const por = Object.fromEntries(linhas.map((l) => [l.estado, l]));
  return {
    rascunhos: por.rascunho?.total || 0,
    emAprovacao: por.em_aprovacao?.total || 0,
    aprovados: por.aprovado?.total || 0,
    pagos: por.pago?.total || 0,
    aReceberCentavos: (por.aprovado?.valor || 0),
    emAprovacaoCentavos: (por.em_aprovacao?.valor || 0),
  };
}

// ------------------------------ Escrita ------------------------------
function criar({ usuario, titulo, centroCusto }) {
  if (!String(titulo || '').trim()) {
    throw new ErroApp('Dê um título ao relatório (ex.: "Visita técnica — Curitiba").', { codigo: 'entrada_invalida' });
  }
  const resultado = executar(
    `INSERT INTO relatorios (protocolo, titulo, solicitante_email, centro_custo, estado)
     VALUES (?, ?, ?, ?, 'rascunho')`,
    proximoProtocolo(),
    titulo.trim(),
    usuario.email,
    centroCusto || usuario.centroCusto || null,
  );
  auditoria.registrar({
    ator: usuario.email, acao: 'relatorio.criado', entidade: 'relatorio', entidadeId: resultado.lastInsertRowid,
  });
  return obter(resultado.lastInsertRowid, usuario);
}

function atualizar(id, usuario, { titulo, centroCusto }) {
  const linha = relatorioBruto(id);
  exigirEdicao(linha, usuario);
  executar(
    `UPDATE relatorios
        SET titulo = COALESCE(?, titulo), centro_custo = COALESCE(?, centro_custo), atualizado_em = datetime('now')
      WHERE id = ?`,
    titulo ? String(titulo).trim() : null,
    centroCusto ?? null,
    id,
  );
  return obter(id, usuario);
}

function excluir(id, usuario) {
  const linha = relatorioBruto(id);
  exigirEdicao(linha, usuario);
  // Anexos precisam sair do disco antes do CASCADE apagar as linhas.
  for (const anexo of anexos.doRelatorio(id)) anexos.remover(anexo.id);
  executar('DELETE FROM relatorios WHERE id = ?', id);
  auditoria.registrar({ ator: usuario.email, acao: 'relatorio.excluido', entidade: 'relatorio', entidadeId: id });
  return { ok: true };
}

function validarDespesa({ data, categoria, valor }) {
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new ErroApp('Informe a data da despesa.', { codigo: 'entrada_invalida' });
  }
  if (!String(categoria || '').trim()) {
    throw new ErroApp('Escolha a categoria da despesa.', { codigo: 'entrada_invalida' });
  }
  const centavos = paraCentavos(valor, { campo: 'valor da despesa' });
  if (centavos <= 0) throw new ErroApp('O valor da despesa precisa ser maior que zero.', { codigo: 'entrada_invalida' });
  return centavos;
}

function adicionarDespesa(relatorioId, usuario, dados) {
  const linha = relatorioBruto(relatorioId);
  exigirEdicao(linha, usuario);

  const centavos = validarDespesa(dados);
  const resultado = executar(
    `INSERT INTO despesas (relatorio_id, data, categoria, descricao, fornecedor, projeto, valor_centavos, justificativa)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    relatorioId,
    dados.data,
    dados.categoria,
    dados.descricao || null,
    dados.fornecedor || null,
    dados.projeto || null,
    centavos,
    dados.justificativa || null,
  );
  recalcular(relatorioId);
  return { despesaId: resultado.lastInsertRowid, relatorio: obter(relatorioId, usuario) };
}

function despesaBruta(despesaId) {
  const linha = consultarUm('SELECT * FROM despesas WHERE id = ?', despesaId);
  if (!linha) throw naoEncontrado('Despesa não encontrada.');
  return linha;
}

function atualizarDespesa(despesaId, usuario, dados) {
  const despesa = despesaBruta(despesaId);
  const relatorio = relatorioBruto(despesa.relatorio_id);
  exigirEdicao(relatorio, usuario);

  const centavos = dados.valor === undefined
    ? despesa.valor_centavos
    : validarDespesa({ data: dados.data ?? despesa.data, categoria: dados.categoria ?? despesa.categoria, valor: dados.valor });

  executar(
    `UPDATE despesas
        SET data = COALESCE(?, data), categoria = COALESCE(?, categoria), descricao = ?,
            fornecedor = ?, projeto = ?, valor_centavos = ?, justificativa = ?,
            atualizado_em = datetime('now')
      WHERE id = ?`,
    dados.data ?? null,
    dados.categoria ?? null,
    dados.descricao ?? despesa.descricao,
    dados.fornecedor ?? despesa.fornecedor,
    dados.projeto ?? despesa.projeto,
    centavos,
    dados.justificativa ?? despesa.justificativa,
    despesaId,
  );
  recalcular(despesa.relatorio_id);
  return obter(despesa.relatorio_id, usuario);
}

function removerDespesa(despesaId, usuario) {
  const despesa = despesaBruta(despesaId);
  const relatorio = relatorioBruto(despesa.relatorio_id);
  exigirEdicao(relatorio, usuario);

  for (const anexo of anexos.daDespesa(despesaId)) anexos.remover(anexo.id);
  executar('DELETE FROM despesas WHERE id = ?', despesaId);
  recalcular(despesa.relatorio_id);
  return obter(despesa.relatorio_id, usuario);
}

// ------------------------------- Envio -------------------------------
function enviar(id, usuario) {
  const linha = relatorioBruto(id);
  exigirEdicao(linha, usuario);

  const despesas = consultar('SELECT * FROM despesas WHERE relatorio_id = ?', id);
  if (!despesas.length) {
    throw new ErroApp('Adicione ao menos uma despesa antes de enviar.', { status: 409, codigo: 'relatorio_vazio' });
  }

  const total = recalcular(id);
  const comBloqueio = consultar('SELECT alertas FROM despesas WHERE relatorio_id = ?', id)
    .flatMap((d) => lerJson(d.alertas, []))
    .filter((a) => a.bloqueia);

  if (comBloqueio.length) {
    throw new ErroApp(
      `Faltam comprovantes em ${comBloqueio.length} despesa${comBloqueio.length > 1 ? 's' : ''}.`,
      { status: 409, codigo: 'faltam_comprovantes', detalhes: comBloqueio },
    );
  }

  const cadeia = politica.cadeiaDeAlcada(total);

  const aplicar = emTransacao(() => {
    // Reenvio depois de devolução: a cadeia é remontada do zero,
    // porque o valor pode ter mudado de faixa de alçada.
    executar('DELETE FROM aprovacoes WHERE relatorio_id = ?', id);
    cadeia.forEach((passo, ordem) => {
      executar(
        `INSERT INTO aprovacoes (relatorio_id, nivel, rotulo, ordem, estado) VALUES (?, ?, ?, ?, 'pendente')`,
        id, passo.nivel, passo.rotulo, ordem,
      );
    });
    executar(
      `UPDATE relatorios
          SET estado = 'em_aprovacao', nivel_atual = ?, enviado_em = datetime('now'),
              decidido_em = NULL, atualizado_em = datetime('now')
        WHERE id = ?`,
      cadeia[0].nivel, id,
    );
  });
  aplicar();

  espelho.enfileirar('reembolso.solicitado', linha.protocolo, {
    protocolo: linha.protocolo,
    titulo: linha.titulo,
    solicitanteEmail: linha.solicitante_email,
    centroCusto: linha.centro_custo,
    valor: total / 100,
    itens: despesas.length,
    alcadaNecessaria: cadeia.at(-1).rotulo,
    canal: 'portal-interno',
    entityTypeId: config.bitrix.entidadeReembolso || undefined,
  });

  auditoria.registrar({
    ator: usuario.email,
    acao: 'relatorio.enviado',
    entidade: 'relatorio',
    entidadeId: id,
    detalhe: { total, cadeia: cadeia.map((c) => c.nivel) },
  });

  return obter(id, usuario);
}

// ----------------------------- Aprovação -----------------------------
// Qual passo está esperando decisão, e se ESTE usuário pode decidi-lo.
function decisaoPendenteDe(relatorio, usuario) {
  if (relatorio.estado !== 'em_aprovacao') return null;
  const passo = consultarUm(
    `SELECT * FROM aprovacoes WHERE relatorio_id = ? AND estado = 'pendente' ORDER BY ordem LIMIT 1`,
    relatorio.id,
  );
  if (!passo) return null;
  // Ninguém aprova o próprio reembolso, nem sendo diretoria.
  if (relatorio.solicitante_email === usuario.email) return null;
  if (!temPapel(usuario, passo.nivel)) return null;
  return passo;
}

function filaDeAprovacao(usuario) {
  const emAprovacao = consultar(`SELECT * FROM relatorios WHERE estado = 'em_aprovacao' ORDER BY enviado_em ASC`);
  return emAprovacao
    .filter((relatorio) => decisaoPendenteDe(relatorio, usuario) !== null)
    .map((relatorio) => {
      const api = paraApi(relatorio);
      const despesas = consultar('SELECT alertas FROM despesas WHERE relatorio_id = ?', relatorio.id);
      api.itens = despesas.length;
      api.alertas = despesas.flatMap((d) => lerJson(d.alertas, [])).length;
      api.aguardandoDesde = relatorio.enviado_em;
      return api;
    });
}

const DECISOES = new Set(['aprovar', 'rejeitar', 'devolver']);

function decidir(id, usuario, { decisao, comentario = null }) {
  if (!DECISOES.has(decisao)) throw new ErroApp('Decisão inválida.', { codigo: 'entrada_invalida' });

  const relatorio = relatorioBruto(id);
  const passo = decisaoPendenteDe(relatorio, usuario);

  if (!passo) {
    if (relatorio.solicitante_email === usuario.email) {
      throw semPermissao('Você não pode decidir sobre o próprio reembolso.');
    }
    throw semPermissao('Este relatório não está aguardando a sua alçada.');
  }
  if (decisao !== 'aprovar' && !String(comentario || '').trim()) {
    throw new ErroApp('Explique o motivo para rejeitar ou devolver.', { codigo: 'entrada_invalida' });
  }

  const estadoDoPasso = { aprovar: 'aprovado', rejeitar: 'rejeitado', devolver: 'devolvido' }[decisao];

  const aplicar = emTransacao(() => {
    executar(
      `UPDATE aprovacoes
          SET estado = ?, decisor_email = ?, comentario = ?, decidido_em = datetime('now')
        WHERE id = ?`,
      estadoDoPasso, usuario.email, comentario || null, passo.id,
    );

    if (decisao === 'aprovar') {
      const proximo = consultarUm(
        `SELECT * FROM aprovacoes WHERE relatorio_id = ? AND estado = 'pendente' ORDER BY ordem LIMIT 1`,
        id,
      );
      if (proximo) {
        executar(
          `UPDATE relatorios SET nivel_atual = ?, atualizado_em = datetime('now') WHERE id = ?`,
          proximo.nivel, id,
        );
      } else {
        executar(
          `UPDATE relatorios
              SET estado = 'aprovado', nivel_atual = NULL, total_aprovado_centavos = total_centavos,
                  decidido_em = datetime('now'), atualizado_em = datetime('now')
            WHERE id = ?`,
          id,
        );
      }
    } else {
      // Rejeição e devolução encerram a rodada — os passos seguintes
      // não fazem mais sentido.
      executar(
        `UPDATE aprovacoes SET estado = 'pulado' WHERE relatorio_id = ? AND estado = 'pendente'`,
        id,
      );
      executar(
        `UPDATE relatorios
            SET estado = ?, nivel_atual = NULL, decidido_em = datetime('now'), atualizado_em = datetime('now')
          WHERE id = ?`,
        decisao === 'rejeitar' ? 'rejeitado' : 'devolvido', id,
      );
    }
  });
  aplicar();

  const depois = relatorioBruto(id);
  if (depois.estado === 'aprovado') {
    espelho.enfileirar('reembolso.aprovado', `${depois.protocolo}:aprovado`, {
      protocolo: depois.protocolo,
      solicitanteEmail: depois.solicitante_email,
      valor: depois.total_aprovado_centavos / 100,
      aprovadoPor: usuario.email,
      centroCusto: depois.centro_custo,
      canal: 'portal-interno',
      entityTypeId: config.bitrix.entidadeReembolso || undefined,
    });
  }

  auditoria.registrar({
    ator: usuario.email,
    acao: `relatorio.${decisao}`,
    entidade: 'relatorio',
    entidadeId: id,
    detalhe: { nivel: passo.nivel, comentario },
  });

  return obter(id, usuario);
}

// Baixa do financeiro: aprovado -> pago.
function marcarPago(id, usuario, { comentario = null } = {}) {
  if (!temPapel(usuario, 'financeiro')) {
    throw semPermissao('Só o financeiro dá baixa em reembolso.');
  }
  const relatorio = relatorioBruto(id);
  if (relatorio.estado !== 'aprovado') {
    throw new ErroApp('Só relatório aprovado pode ser marcado como pago.', { status: 409, codigo: 'estado_invalido' });
  }

  executar(
    `UPDATE relatorios SET estado = 'pago', pago_em = datetime('now'), atualizado_em = datetime('now') WHERE id = ?`,
    id,
  );

  espelho.enfileirar('reembolso.pago', `${relatorio.protocolo}:pago`, {
    protocolo: relatorio.protocolo,
    solicitanteEmail: relatorio.solicitante_email,
    valor: relatorio.total_aprovado_centavos / 100,
    pagoPor: usuario.email,
    canal: 'portal-interno',
    entityTypeId: config.bitrix.entidadeReembolso || undefined,
  });

  auditoria.registrar({
    ator: usuario.email, acao: 'relatorio.pago', entidade: 'relatorio', entidadeId: id, detalhe: { comentario },
  });

  return obter(id, usuario);
}

// ------------------------------ Anexos ------------------------------
async function anexarComprovante(despesaId, usuario, arquivo) {
  const despesa = despesaBruta(despesaId);
  const relatorio = relatorioBruto(despesa.relatorio_id);
  exigirEdicao(relatorio, usuario);

  const anexo = await anexos.registrar(arquivo, {
    relatorioId: relatorio.id,
    despesaId,
    enviadoPor: usuario.email,
  });
  recalcular(relatorio.id);

  auditoria.registrar({
    ator: usuario.email,
    acao: 'comprovante.anexado',
    entidade: 'relatorio',
    entidadeId: relatorio.id,
    detalhe: { despesaId, arquivo: arquivo.originalname },
  });

  return { anexo: anexos.paraApi(anexo), relatorio: obter(relatorio.id, usuario) };
}

function removerComprovante(anexoId, usuario) {
  const anexo = consultarUm('SELECT * FROM anexos WHERE id = ?', anexoId);
  if (!anexo) throw naoEncontrado('Comprovante não encontrado.');
  const relatorio = relatorioBruto(anexo.relatorio_id);
  exigirEdicao(relatorio, usuario);

  anexos.remover(anexoId);
  recalcular(relatorio.id);
  return obter(relatorio.id, usuario);
}

// Controle de acesso do download: solicitante ou quem aprova/financeiro.
function podeBaixarAnexo(anexoLinha, usuario) {
  if (podeAprovarAlgo(usuario) || temPapel(usuario, 'admin')) return true;
  const relatorio = consultarUm('SELECT solicitante_email FROM relatorios WHERE id = ?', anexoLinha.relatorio_id);
  return relatorio?.solicitante_email === usuario.email;
}

module.exports = {
  ESTADOS,
  criar,
  atualizar,
  excluir,
  listar,
  obter,
  resumoDe,
  adicionarDespesa,
  atualizarDespesa,
  removerDespesa,
  enviar,
  decidir,
  marcarPago,
  filaDeAprovacao,
  anexarComprovante,
  removerComprovante,
  podeBaixarAnexo,
  recalcular,
};
