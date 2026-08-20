'use strict';

const { consultar, consultarUm, executar, emTransacao } = require('../db');
const funil = require('./funil');
const auditoria = require('./auditoria');
const { ErroApp, naoEncontrado } = require('./erros');

// ------------------------------------------------------------------
// Carteira de recebíveis: funil, aging, KPIs e régua de cobrança.
//
// O funil é a peça central pro financeiro: cada fatura é um card que
// anda por estágios controlados aqui, não na origem. Movimentar card
// sempre deixa rastro na régua (tabela `interacoes`) — é isso que
// permite ao gestor ver o que foi feito antes de cobrar de novo.
// ------------------------------------------------------------------

function paraApi(linha) {
  const dias = funil.diasEmAtraso(linha.vencimento);
  const encerrada = funil.encerrado(linha.estagio);

  return {
    id: linha.id,
    origem: linha.origem,
    idExterno: linha.id_externo,
    documento: linha.documento,
    cliente: linha.cliente_nome,
    clienteDoc: linha.cliente_doc,
    valorCentavos: linha.valor_centavos,
    valorPagoCentavos: linha.valor_pago_centavos,
    saldoCentavos: Math.max(0, linha.valor_centavos - linha.valor_pago_centavos),
    emissao: linha.emissao,
    vencimento: linha.vencimento,
    pagamento: linha.pagamento,
    estagio: linha.estagio,
    estagioRotulo: funil.estagio(linha.estagio)?.rotulo || linha.estagio,
    responsavel: linha.responsavel_email,
    proximaAcao: linha.proxima_acao,
    proximaAcaoEm: linha.proxima_acao_em,
    promessaEm: linha.promessa_em,
    promessaQuebrada: Boolean(linha.promessa_quebrada),
    observacao: linha.observacao,
    statusOrigem: linha.status_origem,
    urlOrigem: linha.url_origem,
    diasEmAtraso: encerrada ? 0 : Math.max(0, dias),
    faixaAging: funil.faixaAging(linha.vencimento).id,
    atrasada: !encerrada && dias > 0,
    sincronizadoEm: linha.sincronizado_em,
  };
}

// ------------------------------ Filtros ------------------------------
// Monta WHERE + parâmetros a partir dos filtros da tela. Uma função só
// para o funil, a lista, os KPIs e a exportação nunca divergirem.
function montarFiltro(filtros = {}) {
  const condicoes = [];
  const parametros = [];

  if (filtros.busca) {
    condicoes.push('(cliente_nome LIKE ? OR documento LIKE ? OR cliente_doc LIKE ?)');
    const alvo = `%${filtros.busca}%`;
    parametros.push(alvo, alvo, alvo);
  }
  if (filtros.estagio && funil.existe(filtros.estagio)) {
    condicoes.push('estagio = ?');
    parametros.push(filtros.estagio);
  }
  if (filtros.responsavel) {
    condicoes.push('responsavel_email = ?');
    parametros.push(filtros.responsavel);
  }
  if (filtros.cliente) {
    condicoes.push('cliente_nome = ?');
    parametros.push(filtros.cliente);
  }
  if (filtros.origem) {
    condicoes.push('origem = ?');
    parametros.push(filtros.origem);
  }
  if (filtros.apenasAbertas) {
    condicoes.push("estagio NOT IN ('paga', 'perda')");
  }
  if (filtros.apenasAtrasadas) {
    condicoes.push("vencimento < date('now') AND estagio NOT IN ('paga', 'perda')");
  }
  if (filtros.faixa) {
    const faixa = funil.FAIXAS.find((f) => f.id === filtros.faixa);
    if (faixa) {
      condicoes.push("estagio NOT IN ('paga', 'perda')");
      if (Number.isFinite(faixa.min) && faixa.min > -Infinity) {
        condicoes.push("julianday('now') - julianday(vencimento) >= ?");
        parametros.push(faixa.min);
      }
      if (Number.isFinite(faixa.max)) {
        condicoes.push("julianday('now') - julianday(vencimento) <= ?");
        parametros.push(faixa.max);
      }
    }
  }
  if (filtros.vencimentoDe) {
    condicoes.push('vencimento >= ?');
    parametros.push(filtros.vencimentoDe);
  }
  if (filtros.vencimentoAte) {
    condicoes.push('vencimento <= ?');
    parametros.push(filtros.vencimentoAte);
  }

  return {
    onde: condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '',
    parametros,
  };
}

function listar(filtros = {}, { limite = 500 } = {}) {
  const { onde, parametros } = montarFiltro(filtros);
  return consultar(
    `SELECT * FROM cobrancas ${onde}
      ORDER BY (estagio IN ('paga','perda')) ASC, vencimento ASC
      LIMIT ?`,
    ...parametros,
    limite,
  ).map(paraApi);
}

// ------------------------------- Funil -------------------------------
function quadro(filtros = {}) {
  const { onde, parametros } = montarFiltro(filtros);

  const agregados = consultar(
    `SELECT estagio,
            count(*)                                   AS quantidade,
            sum(valor_centavos - valor_pago_centavos)  AS saldo,
            sum(CASE WHEN promessa_quebrada = 1 THEN 1 ELSE 0 END) AS quebradas
       FROM cobrancas ${onde}
      GROUP BY estagio`,
    ...parametros,
  );
  const porEstagio = new Map(agregados.map((linha) => [linha.estagio, linha]));

  // Todo card vai junto: o funil é uma tela de trabalho, e o financeiro
  // precisa arrastar. O limite por coluna evita estourar a tela quando
  // a carteira é grande.
  const cartoes = consultar(
    `SELECT * FROM cobrancas ${onde} ORDER BY vencimento ASC LIMIT 800`,
    ...parametros,
  ).map(paraApi);

  return funil.ESTAGIOS.map((estagio) => {
    const agregado = porEstagio.get(estagio.id);
    return {
      ...estagio,
      quantidade: agregado?.quantidade || 0,
      saldoCentavos: agregado?.saldo || 0,
      promessasQuebradas: agregado?.quebradas || 0,
      cartoes: cartoes.filter((c) => c.estagio === estagio.id).slice(0, 60),
    };
  });
}

// -------------------------------- KPIs --------------------------------
function indicadores(filtros = {}) {
  const { onde, parametros } = montarFiltro(filtros);
  const base = `FROM cobrancas ${onde}`;

  const carteira = consultarUm(
    `SELECT count(*) AS faturas,
            sum(CASE WHEN estagio NOT IN ('paga','perda') THEN valor_centavos - valor_pago_centavos ELSE 0 END) AS aberto,
            sum(CASE WHEN estagio NOT IN ('paga','perda') AND vencimento < date('now')
                     THEN valor_centavos - valor_pago_centavos ELSE 0 END) AS vencido,
            sum(CASE WHEN estagio = 'paga' THEN valor_centavos ELSE 0 END) AS recebido,
            sum(CASE WHEN estagio = 'perda' THEN valor_centavos - valor_pago_centavos ELSE 0 END) AS perdido,
            sum(CASE WHEN estagio = 'juridico' THEN valor_centavos - valor_pago_centavos ELSE 0 END) AS juridico,
            sum(CASE WHEN promessa_quebrada = 1 THEN 1 ELSE 0 END) AS promessasQuebradas
       ${base}`,
    ...parametros,
  );

  // Prazo médio de recebimento: média de dias entre emissão e
  // pagamento, nas faturas liquidadas nos últimos 180 dias.
  const prazo = consultarUm(
    `SELECT avg(julianday(pagamento) - julianday(emissao)) AS dias, count(*) AS base
       FROM cobrancas
      WHERE pagamento IS NOT NULL
        AND emissao IS NOT NULL
        AND pagamento >= date('now', '-180 days')`,
  );

  // Faturamento da janela, usado como denominador do DSO.
  const faturado = consultarUm(
    `SELECT sum(valor_centavos) AS total
       FROM cobrancas
      WHERE emissao >= date('now', '-90 days')`,
  );

  const aberto = carteira?.aberto || 0;
  const vencido = carteira?.vencido || 0;
  const recebido = carteira?.recebido || 0;
  const dso = faturado?.total ? (aberto / faturado.total) * 90 : null;

  return {
    faturas: carteira?.faturas || 0,
    abertoCentavos: aberto,
    vencidoCentavos: vencido,
    recebidoCentavos: recebido,
    perdidoCentavos: carteira.perdido || 0,
    juridicoCentavos: carteira.juridico || 0,
    promessasQuebradas: carteira.promessasQuebradas || 0,
    // Percentual da carteira em aberto que já venceu.
    percentualVencido: aberto ? Number(((vencido / aberto) * 100).toFixed(1)) : 0,
    // Do que saiu do funil, quanto foi recebido (vs. baixado como perda).
    taxaRecuperacao: (recebido + (carteira.perdido || 0))
      ? Number(((recebido / (recebido + (carteira.perdido || 0))) * 100).toFixed(1))
      : null,
    prazoMedioRecebimento: prazo.dias ? Math.round(prazo.dias) : null,
    dso: dso === null ? null : Math.round(dso),
    ticketMedioCentavos: carteira.faturas ? Math.round((aberto + recebido) / carteira.faturas) : 0,
  };
}

function aging(filtros = {}) {
  const { onde, parametros } = montarFiltro({ ...filtros, apenasAbertas: true });
  const linhas = consultar(
    `SELECT vencimento, valor_centavos - valor_pago_centavos AS saldo FROM cobrancas ${onde}`,
    ...parametros,
  );

  const porFaixa = new Map(funil.FAIXAS.map((f) => [f.id, { ...f, quantidade: 0, saldoCentavos: 0 }]));
  for (const linha of linhas) {
    const faixa = porFaixa.get(funil.faixaAging(linha.vencimento).id);
    faixa.quantidade += 1;
    faixa.saldoCentavos += linha.saldo;
  }
  return [...porFaixa.values()];
}

function porCliente(filtros = {}) {
  const { onde, parametros } = montarFiltro(filtros);
  return consultar(
    `SELECT cliente_nome AS cliente,
            cliente_doc  AS documento,
            count(*)     AS faturas,
            sum(CASE WHEN estagio NOT IN ('paga','perda') THEN valor_centavos - valor_pago_centavos ELSE 0 END) AS aberto,
            sum(CASE WHEN estagio NOT IN ('paga','perda') AND vencimento < date('now')
                     THEN valor_centavos - valor_pago_centavos ELSE 0 END) AS vencido,
            max(CASE WHEN estagio NOT IN ('paga','perda')
                     THEN cast(julianday('now') - julianday(vencimento) AS INTEGER) ELSE 0 END) AS maiorAtraso
       FROM cobrancas ${onde}
      GROUP BY cliente_nome, cliente_doc
      HAVING aberto > 0
      ORDER BY vencido DESC, aberto DESC
      LIMIT 100`,
    ...parametros,
  );
}

// ------------------------------ Detalhe ------------------------------
function bruta(id) {
  const linha = consultarUm('SELECT * FROM cobrancas WHERE id = ?', id);
  if (!linha) throw naoEncontrado('Fatura não encontrada.');
  return linha;
}

function obter(id) {
  const cobranca = paraApi(bruta(id));
  cobranca.itens = consultar(
    `SELECT id, placa, transportador, mes_referencia AS mesReferencia, valor_centavos AS valorCentavos
       FROM cobranca_itens WHERE cobranca_id = ? ORDER BY placa`,
    id,
  );
  cobranca.interacoes = consultar(
    `SELECT id, tipo, resumo, de_estagio, para_estagio, autor_email, criado_em
       FROM interacoes WHERE cobranca_id = ? ORDER BY id DESC LIMIT 100`,
    id,
  );
  // Outras faturas em aberto do mesmo cliente — contexto que muda a
  // conversa antes de ligar.
  cobranca.outrasDoCliente = consultar(
    `SELECT id, documento, valor_centavos, vencimento, estagio
       FROM cobrancas
      WHERE cliente_nome = ? AND id <> ? AND estagio NOT IN ('paga','perda')
      ORDER BY vencimento ASC LIMIT 20`,
    cobranca.cliente,
    id,
  );
  return cobranca;
}

// ------------------------------ Ações ------------------------------
function mover(id, usuario, { para, justificativa = null, promessaEm = null, proximaAcao = null, proximaAcaoEm = null }) {
  const linha = bruta(id);

  const impedimento = funil.validarTransicao(linha.estagio, para, { promessaEm, justificativa });
  if (impedimento) throw new ErroApp(impedimento, { status: 409, codigo: 'transicao_invalida' });

  const aplicar = emTransacao(() => {
    executar(
      `UPDATE cobrancas
          SET estagio = ?,
              promessa_em = ?,
              promessa_quebrada = 0,
              proxima_acao = COALESCE(?, proxima_acao),
              proxima_acao_em = COALESCE(?, proxima_acao_em),
              pagamento = CASE WHEN ? = 'paga' AND pagamento IS NULL THEN date('now') ELSE pagamento END,
              valor_pago_centavos = CASE WHEN ? = 'paga' THEN valor_centavos ELSE valor_pago_centavos END,
              atualizado_em = datetime('now')
        WHERE id = ?`,
      para,
      para === 'promessa' ? promessaEm : null,
      proximaAcao,
      proximaAcaoEm,
      para,
      para,
      id,
    );

    executar(
      `INSERT INTO interacoes (cobranca_id, tipo, resumo, de_estagio, para_estagio, autor_email)
       VALUES (?, 'estagio', ?, ?, ?, ?)`,
      id,
      justificativa
        || (para === 'promessa' ? `Cliente prometeu pagar em ${promessaEm}.` : `Movida para ${funil.estagio(para).rotulo}.`),
      linha.estagio,
      para,
      usuario.email,
    );
  });
  aplicar();

  auditoria.registrar({
    ator: usuario.email,
    acao: 'cobranca.movida',
    entidade: 'cobranca',
    entidadeId: id,
    detalhe: { de: linha.estagio, para, promessaEm, justificativa },
  });

  return obter(id);
}

const TIPOS_INTERACAO = Object.freeze(['ligacao', 'email', 'whatsapp', 'reuniao', 'nota']);

function registrarInteracao(id, usuario, { tipo, resumo, proximaAcao = null, proximaAcaoEm = null }) {
  bruta(id);
  if (!TIPOS_INTERACAO.includes(tipo)) {
    throw new ErroApp('Tipo de contato inválido.', { codigo: 'entrada_invalida' });
  }
  if (!String(resumo || '').trim()) {
    throw new ErroApp('Descreva o que foi tratado no contato.', { codigo: 'entrada_invalida' });
  }

  const aplicar = emTransacao(() => {
    executar(
      `INSERT INTO interacoes (cobranca_id, tipo, resumo, autor_email) VALUES (?, ?, ?, ?)`,
      id, tipo, resumo.trim(), usuario.email,
    );
    if (proximaAcao || proximaAcaoEm) {
      executar(
        `UPDATE cobrancas
            SET proxima_acao = COALESCE(?, proxima_acao),
                proxima_acao_em = COALESCE(?, proxima_acao_em),
                atualizado_em = datetime('now')
          WHERE id = ?`,
        proximaAcao, proximaAcaoEm, id,
      );
    }
  });
  aplicar();

  auditoria.registrar({
    ator: usuario.email,
    acao: 'cobranca.contato',
    entidade: 'cobranca',
    entidadeId: id,
    detalhe: { tipo },
  });

  return obter(id);
}

function atribuir(id, usuario, responsavelEmail) {
  bruta(id);
  executar(
    `UPDATE cobrancas SET responsavel_email = ?, atualizado_em = datetime('now') WHERE id = ?`,
    responsavelEmail || null,
    id,
  );
  executar(
    `INSERT INTO interacoes (cobranca_id, tipo, resumo, autor_email) VALUES (?, 'nota', ?, ?)`,
    id,
    responsavelEmail ? `Responsável definido: ${responsavelEmail}.` : 'Responsável removido.',
    usuario.email,
  );
  auditoria.registrar({
    ator: usuario.email,
    acao: 'cobranca.atribuida',
    entidade: 'cobranca',
    entidadeId: id,
    detalhe: { responsavel: responsavelEmail },
  });
  return obter(id);
}

// A agenda do dia: o que precisa de ação hoje ou já atrasou.
function agenda(usuario, { apenasMinhas = false } = {}) {
  const condicoes = ["estagio NOT IN ('paga','perda')", "proxima_acao_em IS NOT NULL", "proxima_acao_em <= date('now')"];
  const parametros = [];
  if (apenasMinhas) {
    condicoes.push('responsavel_email = ?');
    parametros.push(usuario.email);
  }
  return consultar(
    `SELECT * FROM cobrancas WHERE ${condicoes.join(' AND ')} ORDER BY proxima_acao_em ASC LIMIT 50`,
    ...parametros,
  ).map(paraApi);
}

// ----------------------------- Exportação -----------------------------
const CABECALHO_CSV = [
  'Origem', 'ID externo', 'Documento', 'Cliente', 'CNPJ/CPF', 'Valor', 'Pago', 'Saldo',
  'Emissão', 'Vencimento', 'Pagamento', 'Estágio', 'Dias em atraso', 'Responsável',
  'Próxima ação', 'Data da próxima ação', 'Promessa', 'Promessa quebrada',
];

const escaparCsv = (valor) => {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
};

// Reais com vírgula decimal — é o que o Excel em pt-BR entende.
const reais = (centavos) => (Number(centavos || 0) / 100).toFixed(2).replace('.', ',');

function exportarCsv(filtros = {}) {
  const linhas = listar(filtros, { limite: 5000 });
  const corpo = linhas.map((c) => [
    c.origem, c.idExterno, c.documento, c.cliente, c.clienteDoc,
    reais(c.valorCentavos), reais(c.valorPagoCentavos), reais(c.saldoCentavos),
    c.emissao, c.vencimento, c.pagamento, c.estagioRotulo, c.diasEmAtraso,
    c.responsavel, c.proximaAcao, c.proximaAcaoEm, c.promessaEm, c.promessaQuebrada ? 'sim' : 'não',
  ].map(escaparCsv).join(';'));

  // BOM na frente para o Excel abrir acentuação corretamente.
  return `﻿${[CABECALHO_CSV.join(';'), ...corpo].join('\r\n')}\r\n`;
}

module.exports = {
  TIPOS_INTERACAO,
  listar,
  quadro,
  indicadores,
  aging,
  porCliente,
  obter,
  mover,
  registrarInteracao,
  atribuir,
  agenda,
  exportarCsv,
  paraApi,
};
