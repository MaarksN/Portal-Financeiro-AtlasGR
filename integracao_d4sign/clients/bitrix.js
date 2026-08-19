// Cliente para o Bitrix24 REST API usando um Webhook de Entrada (Incoming Webhook).
// Docs: https://apidocs.bitrix24.com/

const axios = require("axios");
const config = require("../config");
const logger = require("../logger");

function client() {
  if (!config.bitrix.webhookUrl) {
    throw new Error("BITRIX_WEBHOOK_URL nao configurada");
  }
  return axios.create({
    baseURL: config.bitrix.webhookUrl.replace(/\/?$/, "/"),
    timeout: 15000,
  });
}

async function call(method, params = {}) {
  const { data } = await client().post(`${method}.json`, params);
  if (data.error) {
    throw new Error(`Bitrix24 [${method}] ${data.error}: ${data.error_description}`);
  }
  return data.result;
}

async function getDeal(dealId) {
  return call("crm.deal.get", { id: dealId });
}

async function getPrimaryContact(deal) {
  if (!deal.CONTACT_ID) return null;
  return call("crm.contact.get", { id: deal.CONTACT_ID });
}

async function updateDealStage(dealId, stageId) {
  logger.info(`Bitrix24: movendo deal ${dealId} para o estagio ${stageId}`);
  return call("crm.deal.update", { id: dealId, fields: { STAGE_ID: stageId } });
}

async function addTimelineComment(dealId, comment) {
  return call("crm.timeline.comment.add", {
    fields: {
      ENTITY_ID: dealId,
      ENTITY_TYPE: "deal",
      COMMENT: comment,
    },
  });
}

async function setDealFields(dealId, fields) {
  return call("crm.deal.update", { id: dealId, fields });
}

/**
 * Lista os deals "Ganho" (ou outro estagio configurado) dentro de um
 * intervalo de datas, usado pela rotina mensal de cobranca no NXFacil.
 */
async function listWonDealsForBilling({ stageId, categoryId, dateFrom, dateTo }) {
  const filter = { STAGE_ID: stageId };
  if (categoryId) filter.CATEGORY_ID = categoryId;
  if (dateFrom || dateTo) {
    filter[">=CLOSEDATE"] = dateFrom;
    filter["<=CLOSEDATE"] = dateTo;
  }

  const deals = [];
  let start = 0;
  // Bitrix24 pagina de 50 em 50; segue paginando ate acabar.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await call("crm.deal.list", {
      filter,
      select: ["ID", "TITLE", "OPPORTUNITY", "CURRENCY_ID", "CONTACT_ID", "CLOSEDATE", "UF_CRM_CPF_CNPJ", "UF_CRM_DIA_VENCIMENTO"],
      start,
    });
    deals.push(...result);
    if (result.length < 50) break;
    start += 50;
  }
  return deals;
}

module.exports = {
  call,
  getDeal,
  getPrimaryContact,
  updateDealStage,
  addTimelineComment,
  setDealFields,
  listWonDealsForBilling,
};
