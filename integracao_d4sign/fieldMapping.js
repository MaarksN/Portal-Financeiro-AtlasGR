// ============================================================================
// MAPEAMENTO DE CAMPOS - ajuste este arquivo para refletir os campos reais
// do seu Bitrix24 (padrao + campos personalizados UF_CRM_xxx).
//
// Para descobrir os codigos dos seus campos personalizados, chame no navegador
// (autenticado) ou via Postman:
//   {SEU_WEBHOOK}/crm.deal.fields
//   {SEU_WEBHOOK}/crm.contact.fields
// e procure os campos que comecam com "UF_CRM_".
// ============================================================================

/**
 * A partir do objeto "deal" (retornado por crm.deal.get) e do objeto
 * "contact" (retornado por crm.contact.get) do Bitrix24, monta os dados
 * que serao usados para preencher o contrato no D4Sign e para cadastrar
 * o signatario.
 */
function buildContractData(deal, contact) {
  const contactName =
    [contact?.NAME, contact?.LAST_NAME].filter(Boolean).join(" ") || deal?.TITLE || "Cliente";

  const email = contact?.EMAIL?.[0]?.VALUE || null;
  const phone = contact?.PHONE?.[0]?.VALUE || null;

  return {
    dealId: String(deal.ID),
    dealTitle: deal.TITLE,
    value: deal.OPPORTUNITY,
    currency: deal.CURRENCY_ID,
    clientName: contactName,
    clientEmail: email,
    clientPhone: phone,
    // Exemplos de campos personalizados - troque UF_CRM_XXXX pelos codigos
    // reais do seu portal antes de usar em producao.
    clientCpfCnpj: deal.UF_CRM_CPF_CNPJ || contact?.UF_CRM_CPF_CNPJ || null,
    plano: deal.UF_CRM_PLANO || null,
    vencimentoDia: deal.UF_CRM_DIA_VENCIMENTO || "10",
  };
}

module.exports = { buildContractData };
