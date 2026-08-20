'use strict';

const crypto = require('crypto');
const path = require('path');

function texto(valor, padrao = '') {
  return valor !== undefined ? String(valor) : padrao;
}

function numero(valor, padrao = 0) {
  const n = Number(valor);
  return isNaN(n) ? padrao : n;
}

function booleano(valor, padrao = false) {
  if (valor === undefined) return padrao;
  return valor === 'true' || valor === '1' || valor === true;
}

const raiz = path.resolve(__dirname);
const dados = path.join(raiz, 'dados');

const config = {
  core: {
    ambiente: texto(process.env.NODE_ENV, 'development'),
    porta: numero(process.env.PORT, 3000),
    segredoSessao: texto(process.env.SESSION_SECRET, crypto.randomBytes(16).toString('hex')),
    duracaoSessaoMs: 12 * 60 * 60 * 1000, // 12 hours
    caminhos: {
      raiz,
      dados,
      db: path.join(dados, 'atlas.db'),
      publico: path.join(raiz, 'public')
    },
    producao: process.env.NODE_ENV === 'production',
    demo: !process.env.BITRIX_WEBHOOK_URL,
    atrasDeProxy: process.env.NODE_ENV === 'production'
  },
  bitrix: {
    configurado: !!(process.env.BITRIX_ATLASGR_WEBHOOK_URL || process.env.BITRIX_WEBHOOK_URL),
    webhook: texto(process.env.BITRIX_ATLASGR_WEBHOOK_URL || process.env.BITRIX_WEBHOOK_URL),
    webhookUrl: texto(process.env.BITRIX_ATLASGR_WEBHOOK_URL || process.env.BITRIX_WEBHOOK_URL),
    atlasgrWebhookUrl: texto(process.env.BITRIX_ATLASGR_WEBHOOK_URL || process.env.BITRIX_WEBHOOK_URL),
    totaltracWebhookUrl: texto(process.env.BITRIX_TOTALTRAC_WEBHOOK_URL),
    categoryId: texto(process.env.BITRIX_CATEGORY_ID),
    stageTrigger: texto(process.env.BITRIX_STAGE_TRIGGER),
    stageSent: texto(process.env.BITRIX_STAGE_SENT),
    stageSigned: texto(process.env.BITRIX_STAGE_SIGNED),
    stageCancelled: texto(process.env.BITRIX_STAGE_CANCELLED),
    stageWonForBilling: texto(process.env.BITRIX_STAGE_WON_FOR_BILLING),
    estagios: {
      enviado: texto(process.env.BITRIX_STAGE_SENT),
      assinado: texto(process.env.BITRIX_STAGE_SIGNED),
      cancelado: texto(process.env.BITRIX_STAGE_CANCELLED),
    }
  },
  apollo: {
    configurado: !!process.env.APOLLO_API_KEY,
    apiKey: texto(process.env.APOLLO_API_KEY),
    baseUrl: 'https://api.apollo.io/v1'
  },
  places: {
    configurado: !!process.env.GOOGLE_PLACES_API_KEY,
    apiKey: texto(process.env.GOOGLE_PLACES_API_KEY)
  },
  hunter: {
    configurado: !!process.env.HUNTER_API_KEY,
    apiKey: texto(process.env.HUNTER_API_KEY),
    baseUrl: 'https://api.hunter.io/v2'
  },
  bland: {
    configurado: !!process.env.BLAND_AI_API_KEY,
    apiKey: texto(process.env.BLAND_AI_API_KEY),
    baseUrl: texto(process.env.BLAND_AI_BASE_URL, 'https://api.bland.ai/v1')
  },
  d4sign: {
    configurado: !!process.env.D4SIGN_TOKEN_API,
    baseUrl: texto(process.env.D4SIGN_BASE_URL),
    tokenApi: texto(process.env.D4SIGN_TOKEN_API),
    cryptKey: texto(process.env.D4SIGN_CRYPT_KEY),
    hmacSecret: texto(process.env.D4SIGN_HMAC_SECRET),
    uuidSafe: texto(process.env.D4SIGN_UUID_SAFE),
    templateId: texto(process.env.D4SIGN_TEMPLATE_ID),
    uuidFolder: texto(process.env.D4SIGN_UUID_FOLDER)
  },
  nxfacil: {
    modo: texto(process.env.NXFACIL_MODE, 'mock'),
    configurado: !!process.env.NXFACIL_API_TOKEN,
    baseUrl: texto(process.env.NXFACIL_BASE_URL),
    apiToken: texto(process.env.NXFACIL_API_TOKEN)
  },
  sicredi: {
    configurado: !!process.env.SICREDI_CLIENT_ID,
    clientId: texto(process.env.SICREDI_CLIENT_ID),
    clientSecret: texto(process.env.SICREDI_CLIENT_SECRET),
    cedente: texto(process.env.SICREDI_CEDENTE),
    carteira: texto(process.env.SICREDI_CARTEIRA)
  },
  sincronizacao: {
    intervaloMinutos: numero(process.env.SINCRONIZACAO_MINUTOS, 15)
  },
  ia: {
    provider: texto(process.env.AI_PROVIDER, 'groq'),
    apiKey: texto(process.env.AI_API_KEY || process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY),
    groqApiKey: texto(process.env.GROQ_API_KEY),
    openrouterApiKey: texto(process.env.OPENROUTER_API_KEY),
    model: texto(process.env.AI_MODEL, 'llama-3.3-70b-versatile'),
    modelo: texto(process.env.AI_MODEL, 'llama-3.3-70b-versatile'),
    configurado: !!(process.env.AI_API_KEY || process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY)
  },
  anexos: {
    pasta: path.join(dados, 'anexos'),
    tamanhoMaximo: 10 * 1024 * 1024, // 10MB
    tiposAceitos: ['image/jpeg', 'image/png', 'application/pdf']
  },
  politica: {
    tetoRecibo: 500000, // 5000 em centavos
    prazoSubmissao: 60,
    niveisAprovacao: ['GERENTE', 'DIRETOR']
  }
};

// Atalhos no nível raiz para compatibilidade com módulos existentes
config.ambiente = config.core.ambiente;
config.porta = config.core.porta;
config.segredoSessao = config.core.segredoSessao;
config.duracaoSessaoMs = config.core.duracaoSessaoMs;
config.caminhos = config.core.caminhos;
config.producao = config.core.producao;
config.demo = config.core.demo;
config.atrasDeProxy = config.core.atrasDeProxy;

// Garantindo exportação segura de todas as chaves
config.bitrix = config.bitrix || {};
config.apollo = config.apollo || {};
config.places = config.places || {};
config.hunter = config.hunter || {};
config.bland = config.bland || {};
config.d4sign = config.d4sign || {};
config.nxfacil = config.nxfacil || {};
config.sicredi = config.sicredi || {};
config.sincronizacao = config.sincronizacao || {};
config.ia = config.ia || {};
config.integracao = config.integracao || {};
config.connect = config.connect || {};
config.perfil = config.perfil || {};

module.exports = config;
