const bitrix = require("../clients/bitrix");
const nxfacil = require("../clients/nxfacil");
const store = require("../store");
const config = require("../config");
const logger = require("../logger");
const { buildContractData } = require("../fieldMapping");

function currentReferenceMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dueDateForDeal(dueDay, referenceMonth) {
  const [year, month] = referenceMonth.split("-").map(Number);
  const day = Number(dueDay) || 10;
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

/**
 * Roda uma vez por mes (ver jobs/monthlyBilling.js): busca os deals
 * "Ganhos" no Bitrix24, e para cada um que ainda nao foi cobrado neste
 * mes, pede ao NXFacil para gerar o boleto e emitir a nota fiscal.
 * Registra tudo no Bitrix24 (timeline) e no banco local (idempotencia).
 */
async function runMonthlyBilling({ referenceMonth = currentReferenceMonth() } = {}) {
  const deals = await bitrix.listWonDealsForBilling({
    stageId: config.bitrix.stageWonForBilling,
    categoryId: config.bitrix.categoryId,
  });

  logger.info(`Cobranca mensal (${referenceMonth}): ${deals.length} deal(s) encontrados no estagio de faturamento.`);

  const results = [];

  for (const deal of deals) {
    const alreadyBilled = await store.wasBilledThisMonth(String(deal.ID), referenceMonth);
    if (alreadyBilled) {
      logger.info(`Deal ${deal.ID}: ja cobrado em ${referenceMonth}, pulando.`);
      continue;
    }

    try {
      const contact = deal.CONTACT_ID ? await bitrix.getPrimaryContact(deal) : null;
      const data = buildContractData(deal, contact);
      await store.upsertDeal(data);
      const cobranca = {
        dealId: data.dealId,
        dealTitle: data.dealTitle,
        clientName: data.clientName,
        clientCpfCnpj: data.clientCpfCnpj,
        value: data.value,
        plano: data.plano,
        dueDate: dueDateForDeal(data.vencimentoDia, referenceMonth),
      };

      const boletoResult = await nxfacil.gerarBoleto(cobranca);
      const notaResult = await nxfacil.emitirNotaFiscal(cobranca);

      await store.recordBillingRun({
        dealId: data.dealId,
        referenceMonth,
        boletoStatus: boletoResult.status,
        notaStatus: notaResult.status,
        detail: { boletoResult, notaResult },
      });

      const modeNote = config.nxfacil.mode === "mock" ? " (modo MOCK - nenhuma chamada real foi feita, ver .env NXFACIL_MODE)" : "";
      await bitrix.addTimelineComment(
        data.dealId,
        `Rotina mensal (${referenceMonth}): boleto e nota fiscal processados via NXFacil.${modeNote}`
      );

      results.push({ dealId: data.dealId, ok: true, boletoResult, notaResult });
    } catch (err) {
      logger.error(`Deal ${deal.ID}: falha na cobranca mensal -`, err.message);
      await store.recordBillingRun({
        dealId: String(deal.ID),
        referenceMonth,
        boletoStatus: "error",
        notaStatus: "error",
        detail: { error: err.message },
      });
      results.push({ dealId: String(deal.ID), ok: false, error: err.message });
    }
  }

  return { referenceMonth, total: deals.length, results };
}

module.exports = { runMonthlyBilling, currentReferenceMonth };
