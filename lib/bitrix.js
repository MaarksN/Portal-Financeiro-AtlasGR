'use strict';

const config = require('../config');
const http = require('./http');
const { ErroApp } = require('./erros');

// ------------------------------------------------------------------
// Caminho de LEITURA do Bitrix24: consulta direta via crm.item.list,
// com webhook próprio de escopo só-leitura. O serviço de integração
// continua sem estado, só recebendo eventos — quem lê é o portal.
// ------------------------------------------------------------------

const configurado = (origem = 'atlasgr') => {
  if (origem === 'totaltrac') return !!config.bitrix.totaltracWebhookUrl;
  return !!(config.bitrix.atlasgrWebhookUrl || config.bitrix.webhookUrl || config.bitrix.webhook);
};

const extrairErro = (corpo) => corpo?.error_description || corpo?.error || null;

function obterWebhookUrl(origem = 'atlasgr') {
  if (origem === 'totaltrac' && config.bitrix.totaltracWebhookUrl) {
    return config.bitrix.totaltracWebhookUrl;
  }
  return config.bitrix.atlasgrWebhookUrl || config.bitrix.webhookUrl || config.bitrix.webhook;
}

function exigirConfiguracao(origem = 'atlasgr') {
  const url = obterWebhookUrl(origem);
  if (!url) {
    throw new ErroApp(`BITRIX_WEBHOOK (${origem}) não configurado.`, { status: 503, codigo: 'bitrix_nao_configurado' });
  }
  return url;
}

// O Bitrix pagina de 50 em 50 pelo parâmetro `start`. Paginamos até
// acabar ou até o teto, pra uma carteira grande não virar loop eterno.
async function listarItens(entityTypeId, { filtro = {}, ordem = { id: 'DESC' }, maximo = 1000, origem = 'atlasgr' } = {}) {
  const webhookUrl = exigirConfiguracao(origem);
  if (!entityTypeId) {
    throw new ErroApp('entityTypeId não configurado para esta entidade.', {
      status: 503,
      codigo: 'entidade_nao_configurada',
    });
  }

  const itens = [];
  let inicio = 0;

  while (itens.length < maximo) {
    const corpo = await http.json(`${webhookUrl}/crm.item.list.json`, {
      metodo: 'POST',
      corpo: { entityTypeId, filter: filtro, order: ordem, start: inicio },
      rotulo: `Bitrix24 (${origem})`,
      extrairErro,
    });

    const lote = corpo?.result?.items || [];
    itens.push(...lote);

    const proximo = corpo?.next;
    if (!lote.length || proximo === undefined || proximo === null) break;
    inicio = proximo;
  }

  return itens.slice(0, maximo);
}

async function verificar(origem = 'atlasgr') {
  const webhookUrl = exigirConfiguracao(origem);
  const corpo = await http.json(`${webhookUrl}/profile.json`, {
    rotulo: `Bitrix24 (${origem})`,
    extrairErro,
  });
  return { ok: true, conta: corpo?.result?.NAME || corpo?.result?.ID || 'desconhecida' };
}

module.exports = { configurado, listarItens, verificar, obterWebhookUrl };
