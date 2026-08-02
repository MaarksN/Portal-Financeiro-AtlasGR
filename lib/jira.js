'use strict';

const config = require('../config');
const http = require('./http');
const log = require('./log');
const { ErroApp } = require('./erros');

// ------------------------------------------------------------------
// Jira Cloud — REST v3, autenticação Basic com e-mail + API token.
// A equipe de chamados já vive no Jira, então ele é o dono do ciclo
// de vida do chamado. O portal cria, lê e comenta; quem transiciona
// status é o Jira (pela fila da equipe) ou o portal, quando o usuário
// tem a transição disponível.
// ------------------------------------------------------------------

const PRIORIDADES = {
  'Crítica': 'Highest',
  Alta: 'High',
  Normal: 'Medium',
  Baixa: 'Low',
};

// Horas de SLA por prioridade — usado como fallback quando o projeto
// não é Service Management (que traz o SLA calculado de fábrica).
const SLA_HORAS = { 'Crítica': 4, Alta: 8, Normal: 24, Baixa: 72 };

const configurado = () => config.jira.configurado;

function autorizacao() {
  const credencial = Buffer.from(`${config.jira.email}:${config.jira.token}`).toString('base64');
  return { Authorization: `Basic ${credencial}`, Accept: 'application/json' };
}

function exigirConfiguracao() {
  if (!configurado()) {
    throw new ErroApp(
      'Jira não configurado. Defina JIRA_BASE, JIRA_EMAIL e JIRA_API_TOKEN no .env.',
      { status: 503, codigo: 'jira_nao_configurado' },
    );
  }
}

const extrairErro = (corpo) => {
  if (!corpo) return null;
  if (Array.isArray(corpo.errorMessages) && corpo.errorMessages.length) return corpo.errorMessages.join(' ');
  if (corpo.errors && typeof corpo.errors === 'object') {
    const partes = Object.entries(corpo.errors).map(([campo, msg]) => `${campo}: ${msg}`);
    if (partes.length) return partes.join(' · ');
  }
  return null;
};

const chamar = (caminho, opcoes = {}) => http.json(`${config.jira.base}${caminho}`, {
  ...opcoes,
  cabecalhos: { ...autorizacao(), ...(opcoes.cabecalhos || {}) },
  rotulo: 'Jira',
  extrairErro,
});

// ------------------------- Texto em ADF -------------------------
// A v3 da API só aceita descrição e comentário em Atlassian Document
// Format. Cada linha em branco vira um parágrafo.
function paraAdf(texto) {
  const paragrafos = String(texto || '')
    .split(/\n{2,}/)
    .map((bloco) => bloco.trim())
    .filter(Boolean);

  return {
    type: 'doc',
    version: 1,
    content: (paragrafos.length ? paragrafos : ['—']).map((bloco) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: bloco }],
    })),
  };
}

function deAdf(no) {
  if (!no) return '';
  if (typeof no === 'string') return no;
  if (no.type === 'text') return no.text || '';
  const filhos = Array.isArray(no.content) ? no.content.map(deAdf).join('') : '';
  return no.type === 'paragraph' ? `${filhos}\n` : filhos;
}

// ------------------------- Normalização -------------------------
const CATEGORIA_STATUS = { new: 'todo', indeterminate: 'andamento', done: 'concluido' };

// O SLA do Jira Service Management vem num customfield cujo id varia
// por instância. Em vez de exigir configuração, procuramos o campo
// pelo formato do valor (ongoingCycle/completedCycle).
function extrairSla(campos) {
  for (const [chave, valor] of Object.entries(campos || {})) {
    if (!chave.startsWith('customfield_') || !valor || typeof valor !== 'object') continue;
    const ciclo = valor.ongoingCycle || (Array.isArray(valor.completedCycles) ? valor.completedCycles.at(-1) : null);
    if (!ciclo) continue;
    return {
      venceEm: ciclo.breachTime?.jira || null,
      violado: Boolean(ciclo.breached),
      restanteMs: ciclo.remainingTime?.millis ?? null,
    };
  }
  return null;
}

function normalizar(issue) {
  const campos = issue.fields || {};
  const sla = extrairSla(campos);
  const criadoEm = campos.created || null;
  const prioridade = campos.priority?.name || 'Medium';

  // Sem JSM, calculamos o prazo pela prioridade a partir da abertura.
  let venceEm = sla?.venceEm || null;
  if (!venceEm && criadoEm) {
    const rotuloPt = Object.keys(PRIORIDADES).find((k) => PRIORIDADES[k] === prioridade);
    const horas = SLA_HORAS[rotuloPt] || 24;
    venceEm = new Date(new Date(criadoEm).getTime() + horas * 3600000).toISOString();
  }

  const categoriaStatus = CATEGORIA_STATUS[campos.status?.statusCategory?.key] || 'andamento';

  return {
    chave: issue.key,
    id: issue.id,
    url: `${config.jira.base}/browse/${issue.key}`,
    resumo: campos.summary || '',
    descricao: deAdf(campos.description).trim(),
    status: campos.status?.name || '—',
    statusCategoria: categoriaStatus,
    prioridade: Object.keys(PRIORIDADES).find((k) => PRIORIDADES[k] === prioridade) || prioridade,
    responsavel: campos.assignee?.displayName || null,
    solicitante: campos.reporter?.emailAddress || campos.reporter?.displayName || null,
    rotulos: campos.labels || [],
    criadoEm,
    atualizadoEm: campos.updated || null,
    slaVenceEm: venceEm,
    slaViolado: sla ? sla.violado : Boolean(venceEm && categoriaStatus !== 'concluido' && new Date(venceEm) < new Date()),
  };
}

// ------------------------------ Escrita ------------------------------
async function criarChamado({ protocolo, resumo, descricao, categoria, prioridade, solicitanteEmail }) {
  exigirConfiguracao();

  const campos = {
    project: { key: config.jira.projeto },
    issuetype: { name: config.jira.tipoIssue },
    summary: resumo,
    description: paraAdf(
      `${descricao}\n\n---\nAberto pelo Portal Interno Atlas\nProtocolo: ${protocolo}\nSolicitante: ${solicitanteEmail}\nCategoria: ${categoria}`,
    ),
    labels: [
      'portal-interno',
      `categoria-${categoria.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`,
    ],
  };

  if (PRIORIDADES[prioridade]) campos.priority = { name: PRIORIDADES[prioridade] };
  if (config.jira.campoSolicitante) campos[config.jira.campoSolicitante] = solicitanteEmail;
  if (config.jira.campoProtocolo) campos[config.jira.campoProtocolo] = protocolo;

  const criada = await chamar('/rest/api/3/issue', { metodo: 'POST', corpo: { fields: campos } });
  log.info('Chamado criado no Jira', { chave: criada.key, protocolo });

  return { chave: criada.key, id: criada.id, url: `${config.jira.base}/browse/${criada.key}` };
}

async function comentar(chave, texto) {
  exigirConfiguracao();
  await chamar(`/rest/api/3/issue/${encodeURIComponent(chave)}/comment`, {
    metodo: 'POST',
    corpo: { body: paraAdf(texto) },
  });
}

// ------------------------------ Leitura ------------------------------
const CAMPOS_LISTA = ['summary', 'status', 'priority', 'assignee', 'reporter', 'created', 'updated', 'labels'];

// O endpoint de busca do Jira Cloud mudou: `/search` saiu de cena em
// favor de `/search/jql` (paginado por token). Tentamos o novo e
// caímos no antigo se a instância ainda não migrou.
async function buscar(jql, { limite = 50, campos = CAMPOS_LISTA } = {}) {
  exigirConfiguracao();

  try {
    const resposta = await chamar('/rest/api/3/search/jql', {
      metodo: 'POST',
      corpo: { jql, maxResults: limite, fields: campos },
    });
    return (resposta.issues || []).map(normalizar);
  } catch (erro) {
    log.aviso('Busca via /search/jql falhou — tentando endpoint legado', { erro: erro.message });
    const resposta = await chamar('/rest/api/3/search', {
      metodo: 'POST',
      corpo: { jql, maxResults: limite, fields: campos },
    });
    return (resposta.issues || []).map(normalizar);
  }
}

const escaparJql = (valor) => String(valor).replace(/["\\]/g, '\\$&');

function jqlDoSolicitante(email) {
  const projeto = `project = "${escaparJql(config.jira.projeto)}"`;
  // Com campo de solicitante configurado usamos ele; senão, o próprio
  // reporter (que só funciona se o e-mail existir como conta Jira) ou
  // o rótulo do portal como rede de segurança.
  if (config.jira.campoSolicitante) {
    return `${projeto} AND "${escaparJql(config.jira.campoSolicitante)}" ~ "${escaparJql(email)}" ORDER BY created DESC`;
  }
  return `${projeto} AND labels = "portal-interno" AND reporter = "${escaparJql(email)}" ORDER BY created DESC`;
}

const listarDoSolicitante = (email, opcoes) => buscar(jqlDoSolicitante(email), opcoes);

const listarDaFila = (opcoes) => buscar(
  `project = "${escaparJql(config.jira.projeto)}" AND labels = "portal-interno" ORDER BY created DESC`,
  opcoes,
);

// Detalhe traz todos os campos porque o SLA do JSM vive num
// customfield de id desconhecido.
async function obter(chave) {
  exigirConfiguracao();
  const campos = config.jira.usarJsm ? '*all' : [...CAMPOS_LISTA, 'description'].join(',');
  const issue = await chamar(`/rest/api/3/issue/${encodeURIComponent(chave)}?fields=${campos}`);
  return normalizar(issue);
}

async function comentarios(chave) {
  exigirConfiguracao();
  const resposta = await chamar(
    `/rest/api/3/issue/${encodeURIComponent(chave)}/comment?orderBy=created&maxResults=50`,
  );
  return (resposta.comments || []).map((c) => ({
    id: c.id,
    autor: c.author?.displayName || '—',
    texto: deAdf(c.body).trim(),
    criadoEm: c.created,
  }));
}

async function transicoes(chave) {
  exigirConfiguracao();
  const resposta = await chamar(`/rest/api/3/issue/${encodeURIComponent(chave)}/transitions`);
  return (resposta.transitions || []).map((t) => ({ id: t.id, nome: t.name, para: t.to?.name }));
}

async function transicionar(chave, idTransicao) {
  exigirConfiguracao();
  await chamar(`/rest/api/3/issue/${encodeURIComponent(chave)}/transitions`, {
    metodo: 'POST',
    corpo: { transition: { id: String(idTransicao) } },
  });
}

// Usado pelo /api/saude — confirma credencial sem efeito colateral.
async function verificar() {
  exigirConfiguracao();
  const eu = await chamar('/rest/api/3/myself');
  return { ok: true, conta: eu.emailAddress || eu.displayName, projeto: config.jira.projeto };
}

module.exports = {
  configurado,
  PRIORIDADES,
  SLA_HORAS,
  criarChamado,
  comentar,
  listarDoSolicitante,
  listarDaFila,
  obter,
  comentarios,
  transicoes,
  transicionar,
  verificar,
  normalizar,
};
