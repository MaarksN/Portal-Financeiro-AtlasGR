'use strict';

const { consultar, consultarUm, executar, emTransacao } = require('../db');
const config = require('../config');
const log = require('./log');
const jira = require('./jira');
const espelho = require('./espelho');
const auditoria = require('./auditoria');
const { ErroApp, naoEncontrado, semPermissao } = require('./erros');
const { temPapel } = require('./usuarios');

// ------------------------------------------------------------------
// Chamados. O Jira é o sistema de registro; esta tabela é espelho de
// leitura para listar e filtrar sem bater na API a cada tela, e para
// o portal ter protocolo próprio mesmo quando o Jira está fora.
// ------------------------------------------------------------------

const CATEGORIAS = Object.freeze([
  'Acesso / login',
  'Sistema fora do ar',
  'Equipamento',
  'Dúvida sobre processo',
  'Solicitação de relatório',
  'Outro',
]);

const PRIORIDADES = Object.freeze(['Crítica', 'Alta', 'Normal', 'Baixa']);

function proximoProtocolo() {
  const ano = new Date().getUTCFullYear();
  const prefixo = `CH-${ano}-`;
  const ultimo = consultarUm(
    `SELECT protocolo FROM chamados WHERE protocolo LIKE ? ORDER BY protocolo DESC LIMIT 1`,
    `${prefixo}%`,
  );
  const sequencia = ultimo ? Number(ultimo.protocolo.slice(prefixo.length)) + 1 : 1;
  return `${prefixo}${String(sequencia).padStart(4, '0')}`;
}

const podeVerTudo = (usuario) => temPapel(usuario, 'ti', 'admin');

function paraApi(linha) {
  return {
    id: linha.id,
    protocolo: linha.protocolo,
    chaveJira: linha.chave_jira,
    urlJira: linha.url_jira,
    solicitante: linha.solicitante_email,
    categoria: linha.categoria,
    prioridade: linha.prioridade,
    resumo: linha.resumo,
    descricao: linha.descricao,
    status: linha.status,
    statusCategoria: linha.status_categoria,
    responsavel: linha.responsavel,
    slaVenceEm: linha.sla_vence_em,
    slaViolado: Boolean(linha.sla_violado),
    criadoEm: linha.criado_em,
    atualizadoEm: linha.atualizado_em,
    sincronizadoEm: linha.sincronizado_em,
  };
}

// ------------------------------- Abertura -------------------------------
async function abrir({ usuario, categoria, prioridade, resumo, descricao }) {
  if (!CATEGORIAS.includes(categoria)) {
    throw new ErroApp('Categoria inválida.', { codigo: 'entrada_invalida' });
  }
  if (!PRIORIDADES.includes(prioridade)) {
    throw new ErroApp('Prioridade inválida.', { codigo: 'entrada_invalida' });
  }

  const protocolo = proximoProtocolo();
  const horas = jira.SLA_HORAS[prioridade] || 24;
  const slaVenceEm = new Date(Date.now() + horas * 3600000).toISOString();

  // Grava local ANTES de falar com o Jira: se a API estiver fora, o
  // usuário não perde o chamado — ele fica pendente de sincronização.
  const resultado = executar(
    `INSERT INTO chamados (
       protocolo, solicitante_email, categoria, prioridade, resumo, descricao,
       status, status_categoria, sla_vence_em
     ) VALUES (?, ?, ?, ?, ?, ?, 'Enviado', 'todo', ?)`,
    protocolo,
    usuario.email,
    categoria,
    prioridade,
    resumo,
    descricao || null,
    slaVenceEm,
  );
  const id = resultado.lastInsertRowid;

  if (jira.configurado()) {
    try {
      const issue = await jira.criarChamado({
        protocolo,
        resumo,
        descricao: descricao || resumo,
        categoria,
        prioridade,
        solicitanteEmail: usuario.email,
      });
      executar(
        `UPDATE chamados
            SET chave_jira = ?, id_jira = ?, url_jira = ?, status = 'Aberto',
                sincronizado_em = datetime('now'), atualizado_em = datetime('now')
          WHERE id = ?`,
        issue.chave,
        issue.id,
        issue.url,
        id,
      );
    } catch (erro) {
      // Não derruba a abertura: o chamado existe, só não chegou ao
      // Jira ainda. A reconciliação não pega isso (não tem chave), então
      // registramos alto para o TI ver.
      log.erro('Chamado gravado localmente mas não criado no Jira', { protocolo, erro: erro.message });
      executar(
        `UPDATE chamados SET status = 'Pendente de sincronização', atualizado_em = datetime('now') WHERE id = ?`,
        id,
      );
    }
  } else if (config.demo) {
    executar(
      `UPDATE chamados SET status = 'Aberto', chave_jira = ?, atualizado_em = datetime('now') WHERE id = ?`,
      `DEMO-${protocolo.slice(-4)}`,
      id,
    );
  }

  const chamado = consultarUm('SELECT * FROM chamados WHERE id = ?', id);
  espelho.espelharChamado(chamado, { evento: 'chamado.aberto' });
  auditoria.registrar({
    ator: usuario.email,
    acao: 'chamado.aberto',
    entidade: 'chamado',
    entidadeId: id,
    detalhe: { protocolo, categoria, prioridade },
  });

  return paraApi(chamado);
}

// ------------------------------- Consulta -------------------------------
function listar({ usuario, status = null, prioridade = null, busca = null, todos = false }) {
  const condicoes = [];
  const parametros = [];

  const verTudo = todos && podeVerTudo(usuario);
  if (!verTudo) {
    condicoes.push('solicitante_email = ?');
    parametros.push(usuario.email);
  }
  if (status) {
    condicoes.push('status_categoria = ?');
    parametros.push(status);
  }
  if (prioridade) {
    condicoes.push('prioridade = ?');
    parametros.push(prioridade);
  }
  if (busca) {
    condicoes.push('(resumo LIKE ? OR protocolo LIKE ? OR chave_jira LIKE ?)');
    const alvo = `%${busca}%`;
    parametros.push(alvo, alvo, alvo);
  }

  const onde = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
  const linhas = consultar(
    `SELECT * FROM chamados ${onde} ORDER BY datetime(criado_em) DESC LIMIT 200`,
    ...parametros,
  );
  return linhas.map(paraApi);
}

function resumoDe(usuario, { todos = false } = {}) {
  const verTudo = todos && podeVerTudo(usuario);
  const onde = verTudo ? '' : 'WHERE solicitante_email = ?';
  const parametros = verTudo ? [] : [usuario.email];

  const linhas = consultar(
    `SELECT status_categoria AS categoria, count(*) AS total,
            sum(CASE WHEN sla_violado = 1 THEN 1 ELSE 0 END) AS violados
       FROM chamados ${onde}
      GROUP BY status_categoria`,
    ...parametros,
  );

  const porCategoria = Object.fromEntries(linhas.map((l) => [l.categoria, l.total]));
  return {
    abertos: (porCategoria.todo || 0) + (porCategoria.andamento || 0),
    naFila: porCategoria.todo || 0,
    emAndamento: porCategoria.andamento || 0,
    concluidos: porCategoria.concluido || 0,
    slaViolado: linhas.reduce((soma, l) => soma + (l.categoria === 'concluido' ? 0 : l.violados || 0), 0),
  };
}

function bruto(id) {
  const linha = consultarUm('SELECT * FROM chamados WHERE id = ?', id);
  if (!linha) throw naoEncontrado('Chamado não encontrado.');
  return linha;
}

function exigirAcesso(linha, usuario) {
  if (linha.solicitante_email !== usuario.email && !podeVerTudo(usuario)) {
    throw semPermissao('Este chamado é de outro solicitante.');
  }
}

async function obter(id, usuario) {
  const linha = bruto(id);
  exigirAcesso(linha, usuario);

  const chamado = paraApi(linha);
  chamado.comentarios = [];
  chamado.transicoes = [];

  if (jira.configurado() && linha.chave_jira) {
    try {
      const [issue, comentarios, transicoes] = await Promise.all([
        jira.obter(linha.chave_jira),
        jira.comentarios(linha.chave_jira),
        jira.transicoes(linha.chave_jira).catch(() => []),
      ]);

      executar(
        `UPDATE chamados
            SET status = ?, status_categoria = ?, responsavel = ?, sla_vence_em = ?, sla_violado = ?,
                sincronizado_em = datetime('now'), atualizado_em = datetime('now')
          WHERE id = ?`,
        issue.status, issue.statusCategoria, issue.responsavel,
        issue.slaVenceEm, issue.slaViolado ? 1 : 0, linha.id,
      );

      Object.assign(chamado, {
        status: issue.status,
        statusCategoria: issue.statusCategoria,
        responsavel: issue.responsavel,
        slaVenceEm: issue.slaVenceEm,
        slaViolado: issue.slaViolado,
        comentarios,
        transicoes,
      });
    } catch (erro) {
      // Detalhe degrada para o espelho local em vez de dar erro na tela.
      log.aviso('Detalhe do chamado veio só do espelho local', { protocolo: linha.protocolo, erro: erro.message });
      chamado.avisoSincronizacao = 'Não foi possível falar com o Jira agora — exibindo a última leitura.';
    }
  }

  chamado.historico = auditoria.historicoDe('chamado', linha.id, 30);
  return chamado;
}

async function comentar(id, usuario, texto) {
  const linha = bruto(id);
  exigirAcesso(linha, usuario);

  if (!linha.chave_jira || !jira.configurado()) {
    throw new ErroApp('Este chamado ainda não está sincronizado com o Jira.', {
      status: 409,
      codigo: 'sem_jira',
    });
  }

  await jira.comentar(linha.chave_jira, `${texto}\n\n— ${usuario.nome} (${usuario.email}), via Portal Interno`);
  auditoria.registrar({
    ator: usuario.email,
    acao: 'chamado.comentado',
    entidade: 'chamado',
    entidadeId: id,
  });
  return { ok: true };
}

// Puxa do Jira os chamados do usuário e atualiza o espelho local.
// Usado pelo botão "Atualizar" da tela.
async function sincronizarDoSolicitante(usuario) {
  if (!jira.configurado()) return { pulado: true, motivo: 'Jira não configurado' };

  const issues = await jira.listarDoSolicitante(usuario.email, { limite: 100 });
  let atualizados = 0;

  const aplicar = emTransacao(() => {
    for (const issue of issues) {
      const existente = consultarUm('SELECT * FROM chamados WHERE chave_jira = ?', issue.chave);
      if (!existente) continue;
      executar(
        `UPDATE chamados
            SET status = ?, status_categoria = ?, responsavel = ?, sla_vence_em = ?, sla_violado = ?,
                sincronizado_em = datetime('now'), atualizado_em = datetime('now')
          WHERE id = ?`,
        issue.status, issue.statusCategoria, issue.responsavel,
        issue.slaVenceEm, issue.slaViolado ? 1 : 0, existente.id,
      );
      atualizados += 1;
    }
  });
  aplicar();

  return { atualizados, doJira: issues.length };
}

module.exports = {
  CATEGORIAS,
  PRIORIDADES,
  abrir,
  listar,
  obter,
  comentar,
  resumoDe,
  sincronizarDoSolicitante,
  paraApi,
};
