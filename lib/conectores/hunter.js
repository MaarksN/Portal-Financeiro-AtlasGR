'use strict';

const config = require('../../config');
const http = require('../http');
const log = require('../log');
const { ErroApp } = require('../erros');

// ------------------------------------------------------------------
// Conector Hunter.io: validação de entregabilidade de e-mails para
// contratos/boletos e localização de e-mails corporativos (financeiro).
// ------------------------------------------------------------------

function exigirConfiguracao() {
  if (!config.hunter?.apiKey) {
    throw new ErroApp('HUNTER_API_KEY não configurada no .env.', {
      status: 503,
      codigo: 'hunter_nao_configurada',
    });
  }
}

/**
 * Valida se um endereço de e-mail é válido e entregável
 */
async function verificarEmail(email) {
  exigirConfiguracao();

  const url = `${config.hunter.baseUrl}/email-verifier?email=${encodeURIComponent(email)}&api_key=${config.hunter.apiKey}`;
  const corpo = await http.json(url, {
    metodo: 'GET',
    rotulo: 'Hunter.io Verificação de Email',
  });

  const dados = corpo?.data;
  return {
    email: dados?.email || email,
    status: dados?.status || 'unknown', // 'valid', 'invalid', 'accept_all', 'webmail', 'disposable', 'unknown'
    pontuacao: dados?.score || 0,
    entregavel: dados?.status === 'valid' || (dados?.score && dados.score >= 70),
    motivoBloqueio: dados?.result || null,
  };
}

/**
 * Busca e-mails corporativos a partir do domínio da empresa
 */
async function buscarPorDominio(dominio, { departamento = null, limite = 10 } = {}) {
  exigirConfiguracao();

  let url = `${config.hunter.baseUrl}/domain-search?domain=${encodeURIComponent(dominio)}&limit=${limite}&api_key=${config.hunter.apiKey}`;
  if (departamento) {
    url += `&department=${encodeURIComponent(departamento)}`;
  }

  const corpo = await http.json(url, {
    metodo: 'GET',
    rotulo: 'Hunter.io Busca por Domínio',
  });

  const emails = (corpo?.data?.emails || []).map((e) => ({
    email: e.value,
    tipo: e.type,
    confianca: e.confidence,
    primeiroNome: e.first_name,
    sobrenome: e.last_name,
    cargo: e.position,
    departamento: e.department,
  }));

  return {
    dominio,
    organizacao: corpo?.data?.organization || null,
    total: corpo?.data?.results || emails.length,
    emails,
  };
}

module.exports = {
  verificarEmail,
  buscarPorDominio,
};
