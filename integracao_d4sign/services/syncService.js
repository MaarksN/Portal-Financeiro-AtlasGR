const bitrix = require("../clients/bitrix");
const store = require("../store");
const config = require("../config");
const logger = require("../logger");

/**
 * Trata os eventos recebidos do webhook do D4Sign e sincroniza de volta
 * com o Bitrix24 (avanca/retrocede o funil).
 *
 * type_post (D4Sign):
 *   "1" = Documento finalizado (todos assinaram)      -> move para stageSigned
 *   "3" = Documento cancelado                          -> move para stageCancelled
 *   "4" = Um signatario assinou (documento ainda pode
 *         estar aguardando outros signatarios)          -> apenas comentario no timeline
 */
async function handleD4signEvent(payload) {
  const { uuid, type_post: typePost, message } = payload;

  const dealId = await store.findDealIdByD4signUuid(uuid);
  if (!dealId) {
    logger.warn(`Webhook D4Sign: nenhum deal do Bitrix24 vinculado ao documento ${uuid} (evento: ${message}).`);
    return { handled: false };
  }

  switch (String(typePost)) {
    case "1": // Finished document
      await store.updateContractStatusByD4signUuid(uuid, "signed");
      await bitrix.updateDealStage(dealId, config.bitrix.stageSigned);
      await bitrix.addTimelineComment(dealId, `Contrato assinado por todas as partes (D4Sign ${uuid}).`);
      logger.info(`Deal ${dealId}: contrato finalizado, funil atualizado para ${config.bitrix.stageSigned}.`);
      return { handled: true, action: "signed" };

    case "3": // Cancelled document
      await store.updateContractStatusByD4signUuid(uuid, "cancelled");
      await bitrix.updateDealStage(dealId, config.bitrix.stageCancelled);
      await bitrix.addTimelineComment(dealId, `Assinatura do contrato foi cancelada (D4Sign ${uuid}). ${payload.cancellation_message || ""}`);
      return { handled: true, action: "cancelled" };

    case "4": { // Signed (por um dos signatarios)
      const signerEmail = payload.signer?.email || payload.email || "signatario";
      await bitrix.addTimelineComment(dealId, `${signerEmail} assinou o contrato (D4Sign ${uuid}).`);
      return { handled: true, action: "partial_signature" };
    }

    case "2": // E-mail nao entregue
      await bitrix.addTimelineComment(
        dealId,
        `Atencao: e-mail do contrato nao foi entregue para ${payload.signer?.email || payload.email} (D4Sign ${uuid}). Verifique o endereco cadastrado.`
      );
      return { handled: true, action: "email_bounced" };

    default:
      logger.warn(`Webhook D4Sign: type_post desconhecido (${typePost}) para o documento ${uuid}.`);
      return { handled: false };
  }
}

module.exports = { handleD4signEvent };
