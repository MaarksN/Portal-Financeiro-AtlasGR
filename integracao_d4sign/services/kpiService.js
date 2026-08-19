// Junta o retrato dos deals (store.deals) com o status do contrato
// (contract_links) e a ultima cobranca conhecida (billing_runs) para
// alimentar a Carteira e os KPIs do painel financeiro.

const store = require("../store");
const { currentReferenceMonth } = require("./billingService");

const STATUS_LABEL = {
  sent: "Enviado para assinatura",
  signed: "Assinado",
  cancelled: "Cancelado",
};

async function buildCarteira() {
  const [deals, contractLinks, billingRuns] = await Promise.all([
    store.listDeals(),
    store.listContractLinks(),
    store.listBillingRuns(),
  ]);

  const linkByDeal = new Map(contractLinks.map((l) => [l.dealId, l]));
  const billingByDeal = new Map();
  for (const run of billingRuns) {
    const existing = billingByDeal.get(run.dealId);
    if (!existing || run.createdAt > existing.createdAt) billingByDeal.set(run.dealId, run);
  }

  return deals.map((deal) => {
    const link = linkByDeal.get(deal.dealId);
    const billing = billingByDeal.get(deal.dealId);
    return {
      dealId: deal.dealId,
      title: deal.title,
      clientName: deal.clientName,
      clientEmail: deal.clientEmail,
      value: deal.value,
      currency: deal.currency || "BRL",
      plano: deal.plano,
      vencimentoDia: deal.vencimentoDia,
      contractStatus: link?.status || null,
      contractStatusLabel: link ? STATUS_LABEL[link.status] || link.status : "Sem contrato gerado",
      contractUpdatedAt: link?.updatedAt || link?.createdAt || null,
      ultimaCobranca: billing
        ? { referenceMonth: billing.referenceMonth, boletoStatus: billing.boletoStatus, notaStatus: billing.notaStatus }
        : null,
      updatedAt: deal.updatedAt,
    };
  });
}

async function buildKpis() {
  const [carteira, contractLinks] = await Promise.all([buildCarteira(), store.listContractLinks()]);
  const referenceMonth = currentReferenceMonth();
  const billingRunsMes = await store.listBillingRuns({ referenceMonth });

  const totalCarteira = carteira.reduce((sum, d) => sum + (Number(d.value) || 0), 0);

  const contagemStatus = { sent: 0, signed: 0, cancelled: 0 };
  contractLinks.forEach((l) => {
    if (contagemStatus[l.status] !== undefined) contagemStatus[l.status] += 1;
  });
  const totalComContrato = contagemStatus.sent + contagemStatus.signed + contagemStatus.cancelled;
  const taxaAssinatura = totalComContrato > 0 ? (contagemStatus.signed / totalComContrato) * 100 : 0;

  const cobranca = { ok: 0, mock: 0, error: 0, pending: 0 };
  billingRunsMes.forEach((r) => {
    const status = r.boletoStatus in cobranca ? r.boletoStatus : "pending";
    cobranca[status] += 1;
  });

  return {
    totalCarteira,
    totalDeals: carteira.length,
    contratos: { ...contagemStatus, total: totalComContrato },
    taxaAssinatura,
    cobrancaMes: { referenceMonth, total: billingRunsMes.length, ...cobranca },
  };
}

module.exports = { buildCarteira, buildKpis };
