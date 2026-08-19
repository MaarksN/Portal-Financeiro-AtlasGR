// Calcula os alertas gerenciais exibidos no painel (Painel Financeiro):
// contratos parados sem assinatura, cobrancas com erro, cobranca mensal
// ainda nao rodada, e integracoes nao configuradas. Tudo derivado do que
// ja esta salvo no store - nenhuma chamada externa aqui.

const store = require("../store");
const config = require("../config");
const { currentReferenceMonth } = require("./billingService");

const DIAS_ATENCAO = 3;
const DIAS_CRITICO = 10;

function diasDesde(dataIso) {
  if (!dataIso) return null;
  const ms = Date.now() - new Date(dataIso).getTime();
  return Math.floor(ms / (24 * 3600 * 1000));
}

async function computeAlerts() {
  const [contractLinks, deals] = await Promise.all([store.listContractLinks(), store.listDeals()]);
  const dealById = new Map(deals.map((d) => [d.dealId, d]));
  const referenceMonth = currentReferenceMonth();
  const billingRunsThisMonth = await store.listBillingRuns({ referenceMonth });

  const alerts = [];

  for (const link of contractLinks) {
    if (link.status !== "sent") continue;
    const dias = diasDesde(link.updatedAt || link.createdAt);
    if (dias === null || dias < DIAS_ATENCAO) continue;
    const deal = dealById.get(link.dealId);
    const nomeCliente = deal?.clientName || deal?.title || `Deal ${link.dealId}`;
    alerts.push({
      id: `assinatura-${link.dealId}`,
      severidade: dias >= DIAS_CRITICO ? "critico" : "atencao",
      titulo: `Contrato aguardando assinatura ha ${dias} dia(s)`,
      subtitulo: `${nomeCliente} - documento D4Sign ${link.d4signUuid}`,
      tag: "Assinatura",
      dealId: link.dealId,
    });
  }

  for (const run of billingRunsThisMonth) {
    if (run.boletoStatus === "error" || run.notaStatus === "error") {
      const deal = dealById.get(run.dealId);
      const nomeCliente = deal?.clientName || deal?.title || `Deal ${run.dealId}`;
      alerts.push({
        id: `cobranca-erro-${run.dealId}`,
        severidade: "critico",
        titulo: `Falha na cobranca de ${referenceMonth}`,
        subtitulo: `${nomeCliente} - boleto: ${run.boletoStatus}, nota: ${run.notaStatus}`,
        tag: "Cobranca",
        dealId: run.dealId,
      });
    }
  }

  const hojeDia = new Date().getUTCDate();
  if (hojeDia > 2 && billingRunsThisMonth.length === 0 && config.bitrix.stageWonForBilling) {
    alerts.push({
      id: `cobranca-mes-pendente-${referenceMonth}`,
      severidade: "atencao",
      titulo: `Cobranca mensal de ${referenceMonth} ainda nao foi executada`,
      subtitulo: "Rode manualmente pelo painel ou aguarde o cron do dia 1.",
      tag: "Rotina mensal",
      dealId: null,
    });
  }

  if (!config.bitrix.webhookUrl) {
    alerts.push({
      id: "config-bitrix",
      severidade: "atencao",
      titulo: "Bitrix24 nao configurado",
      subtitulo: "Defina BITRIX_WEBHOOK_URL nas variaveis de ambiente.",
      tag: "Configuracao",
      dealId: null,
    });
  }
  if (!config.d4sign.tokenApi || !config.d4sign.cryptKey) {
    alerts.push({
      id: "config-d4sign",
      severidade: "atencao",
      titulo: "D4Sign nao configurado",
      subtitulo: "Defina D4SIGN_TOKEN_API e D4SIGN_CRYPT_KEY nas variaveis de ambiente.",
      tag: "Configuracao",
      dealId: null,
    });
  }
  if (config.nxfacil.mode === "mock") {
    alerts.push({
      id: "config-nxfacil-mock",
      severidade: "info",
      titulo: "NXFacil em modo mock",
      subtitulo: "Nenhum boleto/nota real esta sendo emitido. Ajuste NXFACIL_MODE=http quando tiver as credenciais.",
      tag: "Configuracao",
      dealId: null,
    });
  }

  const ordem = { critico: 0, atencao: 1, info: 2 };
  alerts.sort((a, b) => ordem[a.severidade] - ordem[b.severidade]);
  return alerts;
}

module.exports = { computeAlerts };
