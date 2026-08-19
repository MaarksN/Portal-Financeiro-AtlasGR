'use strict';

const config = require('../config');
const http = require('./http');
const { ErroApp } = require('./erros');

// ------------------------------------------------------------------
// Bitrix24 via API classica de Deals (crm.deal.*) — usado pelo modulo
// de Contratos & Cobranca. E' um webhook diferente em uso (mesma URL
// BITRIX_WEBHOOK de lib/bitrix.js, que le a SPA de cobranca via
// crm.item.*), mas a entidade e' outra: negocio classico do funil.
// ------------------------------------------------------------------

const extrairErro = (corpo) => corpo?.error_description || corpo?.error || null;

function exigirConfiguracao() {
  if (!config.bitrix.configurado) {
    throw new ErroApp('BITRIX_WEBHOOK não configurado.', { status: 503, codigo: 'bitrix_nao_configurado' });
  }
}

async function chamar(metodo, parametros = {}) {
  exigirConfiguracao();
  const corpo = await http.json(`${config.bitrix.webhook}/${metodo}.json`, {
    metodo: 'POST',
    corpo: parametros,
    rotulo: 'Bitrix24',
    extrairErro,
  });
  return corpo.result;
}

async function getDeal(dealId) {
  return chamar('crm.deal.get', { id: dealId });
}

async function getPrimaryContact(deal) {
  if (!deal.CONTACT_ID) return null;
  return chamar('crm.contact.get', { id: deal.CONTACT_ID });
}

async function updateDealStage(dealId, stageId) {
  return chamar('crm.deal.update', { id: dealId, fields: { STAGE_ID: stageId } });
}

async function addTimelineComment(dealId, comment) {
  return chamar('crm.timeline.comment.add', {
    fields: { ENTITY_ID: dealId, ENTITY_TYPE: 'deal', COMMENT: comment },
  });
}

/**
 * Lista os deals "Ganho" (ou outro estagio configurado), paginando de
 * 50 em 50, para a rotina mensal de cobranca.
 */
async function listarGanhosParaCobranca({ stageId, categoryId }) {
  const filtro = { STAGE_ID: stageId };
  if (categoryId) filtro.CATEGORY_ID = categoryId;

  const deals = [];
  let start = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const lote = await chamar('crm.deal.list', {
      filter: filtro,
      select: ['ID', 'TITLE', 'OPPORTUNITY', 'CURRENCY_ID', 'CONTACT_ID', 'CLOSEDATE', 'UF_CRM_CPF_CNPJ', 'UF_CRM_DIA_VENCIMENTO'],
      start,
    });
    deals.push(...lote);
    if (lote.length < 50) break;
    start += 50;
  }
  return deals;
}

module.exports = {
  getDeal,
  getPrimaryContact,
  updateDealStage,
  addTimelineComment,
  listarGanhosParaCobranca,
};
