'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ------------------------------------------------------------------
// Leitura tipada do ambiente. Nada aqui lança na importação — o que
// falta vira `configurado: false` no bloco do módulo correspondente,
// e o portal sobe em modo demonstração em vez de morrer no boot.
// A única exceção é o SESSION_SECRET em produção (ver adiante).
// ------------------------------------------------------------------

function texto(nome, padrao = '') {
  const bruto = process.env[nome];
  if (bruto === undefined || bruto === null) return padrao;
  const limpo = String(bruto).trim();
  return limpo === '' ? padrao : limpo;
}

function numero(nome, padrao) {
  // Cuidado: Number('') é 0, e 0 é finito — sem esta guarda, toda
  // variável ausente viraria zero (sessão de 0ms, teto de anexo 0...).
  const bruto = texto(nome);
  if (bruto === '') return padrao;
  const valor = Number(bruto);
  return Number.isFinite(valor) ? valor : padrao;
}

function booleano(nome, padrao = false) {
  const valor = texto(nome).toLowerCase();
  if (!valor) return padrao;
  return ['1', 'true', 'sim', 'on', 'yes'].includes(valor);
}

const ambiente = texto('NODE_ENV', 'development');
const producao = ambiente === 'production';

const raiz = __dirname;
const pastaDados = path.resolve(texto('ATLAS_DADOS', path.join(raiz, 'dados')));
const pastaAnexos = path.join(pastaDados, 'anexos');

fs.mkdirSync(pastaAnexos, { recursive: true });

// ------------------------------------------------------------------
// Segredo de sessão. Em produção é obrigatório e forte. Em
// desenvolvimento, geramos um e guardamos em disco — assim o
// `node --watch` reinicia sem derrubar quem já estava logado.
// ------------------------------------------------------------------
function resolverSegredoSessao() {
  const doAmbiente = texto('SESSION_SECRET');
  if (doAmbiente) {
    if (producao && doAmbiente.length < 32) {
      throw new Error('SESSION_SECRET precisa ter ao menos 32 caracteres em produção.');
    }
    return doAmbiente;
  }
  if (producao) {
    throw new Error('SESSION_SECRET não configurado — obrigatório em produção.');
  }
  const arquivo = path.join(pastaDados, '.segredo-dev');
  try {
    const salvo = fs.readFileSync(arquivo, 'utf8').trim();
    if (salvo) return salvo;
  } catch {
    /* primeiro boot — gera abaixo */
  }
  const gerado = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(arquivo, gerado, { mode: 0o600 });
  return gerado;
}

// ---------------------------- Jira Cloud ----------------------------
const jira = {
  base: texto('JIRA_BASE').replace(/\/+$/, ''),
  email: texto('JIRA_EMAIL'),
  token: texto('JIRA_API_TOKEN'),
  projeto: texto('JIRA_PROJETO', 'ATL'),
  tipoIssue: texto('JIRA_TIPO_ISSUE', 'Task'),
  // Campo customizado que guarda o e-mail do solicitante do portal.
  // Sem ele, caímos em busca por `reporter` — ver lib/jira.js.
  campoSolicitante: texto('JIRA_CAMPO_SOLICITANTE'),
  campoProtocolo: texto('JIRA_CAMPO_PROTOCOLO'),
  // Jira Service Management: só existe se o projeto for do tipo service desk.
  usarJsm: booleano('JIRA_USAR_JSM', false),
};
jira.configurado = Boolean(jira.base && jira.email && jira.token);

// ------------------------------ Bitrix ------------------------------
const bitrix = {
  webhook: texto('BITRIX_WEBHOOK').replace(/\/+$/, ''),
  entidadeChamado: numero('ENTITY_TYPE_ID_CHAMADO', 0),
  entidadeReembolso: numero('ENTITY_TYPE_ID_REEMBOLSO', 0),
  entidadeCobranca: numero('ENTITY_TYPE_ID_COBRANCA', 0),
  // Nomes dos campos customizados da SPA de cobrança. Os padrões são
  // os que o atlas-provisionar-spas.js gera; se o seu Bitrix usa
  // outros, sobrescreva pelo .env em vez de mexer no código.
  campos: {
    documento: texto('BITRIX_CAMPO_DOCUMENTO', 'ufCrm_DOCUMENTO'),
    cliente: texto('BITRIX_CAMPO_CLIENTE', 'ufCrm_CLIENTE'),
    clienteDoc: texto('BITRIX_CAMPO_CLIENTE_DOC', 'ufCrm_CLIENTE_DOC'),
    valor: texto('BITRIX_CAMPO_VALOR', 'ufCrm_VALOR'),
    valorPago: texto('BITRIX_CAMPO_VALOR_PAGO', 'ufCrm_VALOR_PAGO'),
    emissao: texto('BITRIX_CAMPO_EMISSAO', 'ufCrm_EMISSAO'),
    vencimento: texto('BITRIX_CAMPO_VENCIMENTO', 'ufCrm_VENCIMENTO'),
    pagamento: texto('BITRIX_CAMPO_PAGAMENTO', 'ufCrm_PAGAMENTO'),
  },
};
bitrix.configurado = Boolean(bitrix.webhook);

// ------------------ Serviço de integração existente ------------------
const integracao = {
  url: texto('INTEGRACAO_URL').replace(/\/+$/, ''),
  segredo: texto('SEGREDO_ENTRADA'),
};
integracao.configurado = Boolean(integracao.url && integracao.segredo);

// -------------------- Fontes externas de cobrança --------------------
// Connect Plus (legado PHP) e Perfil Securitário (Next.js). Os dois
// exigem endpoint + credencial próprios; enquanto não houver, o
// conector se declara inativo e o funil continua sendo alimentado
// pelo Bitrix, por CSV ou pelo seed de demonstração.
const connect = {
  base: texto('CONNECT_BASE').replace(/\/+$/, ''),
  token: texto('CONNECT_TOKEN'),
  caminhoCobrancas: texto('CONNECT_CAMINHO_COBRANCAS', '/api/cobrancas'),
};
connect.configurado = Boolean(connect.base && connect.token);

const perfil = {
  base: texto('PERFIL_BASE').replace(/\/+$/, ''),
  token: texto('PERFIL_TOKEN'),
  caminhoCobrancas: texto('PERFIL_CAMINHO_COBRANCAS', '/api/report/billing'),
};
perfil.configurado = Boolean(perfil.base && perfil.token);

// ------------------------------ Anexos ------------------------------
const anexos = {
  pasta: pastaAnexos,
  tamanhoMaximo: numero('ANEXO_TAMANHO_MAX_MB', 10) * 1024 * 1024,
  tiposAceitos: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
  ],
};

// ------------------------ Política de despesa ------------------------
// Tetos em centavos. `null` = sem teto. Estes valores são o padrão de
// fábrica; a tabela `politica_categorias` no banco manda quando existe
// linha para a categoria (ver lib/politica.js).
const politica = {
  moeda: 'BRL',
  // Acima deste valor a despesa exige comprovante anexado.
  exigeComprovanteAcimaDe: numero('POLITICA_COMPROVANTE_ACIMA_DE', 0) * 100,
  // Janela em que a despesa pode ser lançada, contada do dia do gasto.
  prazoLancamentoDias: numero('POLITICA_PRAZO_LANCAMENTO_DIAS', 60),
  // Alçada em cadeia: o relatório sobe por todos os níveis cujo teto
  // é menor que o total. Valores em centavos.
  alcadas: [
    { nivel: 'coordenacao', rotulo: 'Coordenação', ate: numero('ALCADA_COORDENACAO', 1000) * 100 },
    { nivel: 'gerencia', rotulo: 'Gerência', ate: numero('ALCADA_GERENCIA', 5000) * 100 },
    { nivel: 'diretoria', rotulo: 'Diretoria', ate: null },
  ],
};

// ------------------------------- Modo -------------------------------
// Demonstração é ligado explicitamente, ou automaticamente quando não
// há nenhuma fonte real configurada — assim o portal roda inteiro na
// primeira execução, sem .env, com dados semeados.
const algumaFonteReal = jira.configurado || bitrix.configurado || connect.configurado || perfil.configurado;
const demo = booleano('ATLAS_DEMO', !algumaFonteReal);

module.exports = {
  ambiente,
  producao,
  demo,
  porta: numero('PORT', 3000),
  atrasDeProxy: booleano('ATRAS_DE_PROXY', producao),
  segredoSessao: resolverSegredoSessao(),
  duracaoSessaoMs: numero('SESSAO_HORAS', 8) * 60 * 60 * 1000,
  caminhos: {
    raiz,
    dados: pastaDados,
    banco: path.join(pastaDados, 'atlas.db'),
    publico: path.join(raiz, 'public'),
  },
  jira,
  bitrix,
  integracao,
  connect,
  perfil,
  anexos,
  politica,
  sincronizacao: {
    // Intervalo do job que puxa cobranças das fontes e reconcilia o
    // espelho de chamados. 0 desliga o agendamento automático.
    intervaloMinutos: numero('SINCRONIZACAO_MINUTOS', demo ? 0 : 15),
  },
};
