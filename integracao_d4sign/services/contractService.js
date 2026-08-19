const bitrix = require("../clients/bitrix");
const d4sign = require("../clients/d4sign");
const store = require("../store");
const config = require("../config");
const logger = require("../logger");
const { buildContractData } = require("../fieldMapping");

/**
 * Fluxo completo disparado quando um deal do Bitrix24 entra no estagio
 * "gerar contrato":
 *   1. Busca o deal + contato principal no Bitrix24
 *   2. Cria o documento no D4Sign a partir do template
 *   3. Cadastra o cliente como signatario
 *   4. Envia para assinatura
 *   5. Salva o vinculo deal <-> documento
 *   6. Move o deal para o estagio "enviado para assinatura"
 */
async function generateAndSendContract(dealId) {
  const deal = await bitrix.getDeal(dealId);
  const contact = await bitrix.getPrimaryContact(deal);
  const data = buildContractData(deal, contact);
  await store.upsertDeal(data);

  if (!data.clientEmail) {
    throw new Error(`Deal ${dealId}: contato sem e-mail cadastrado - nao e possivel enviar para assinatura.`);
  }

  const documentName = `Contrato - ${data.clientName} - ${data.dealTitle}`.slice(0, 190);

  const createResult = await d4sign.createDocumentFromTemplate({ documentName });
  const documentUuid = extractDocumentUuid(createResult);
  if (!documentUuid) {
    throw new Error(`Nao foi possivel extrair o UUID do documento criado no D4Sign. Resposta: ${JSON.stringify(createResult)}`);
  }

  await d4sign.addSigners(documentUuid, [
    {
      email: data.clientEmail,
      act: "1", // Assinar
      foreign: "0",
      certificadoicpbr: "0",
      assinatura_presencial: "0",
    },
  ]);

  await d4sign.sendToSign(documentUuid, `Olá ${data.clientName}, segue o contrato "${data.dealTitle}" para assinatura.`);

  await store.saveContractLink({ dealId: data.dealId, d4signUuid: documentUuid, status: "sent" });

  await bitrix.updateDealStage(data.dealId, config.bitrix.stageSent);
  await bitrix.addTimelineComment(
    data.dealId,
    `Contrato gerado e enviado para assinatura via D4Sign (documento ${documentUuid}).`
  );

  logger.info(`Deal ${dealId}: contrato ${documentUuid} enviado para assinatura de ${data.clientEmail}.`);
  return { dealId: data.dealId, documentUuid };
}

function extractDocumentUuid(createResult) {
  // O formato exato de retorno pode variar; cobre os formatos mais comuns
  // reportados na documentacao/comunidade da D4Sign. Ajuste se necessario
  // apos o primeiro teste real (log da resposta fica em createResult).
  if (!createResult) return null;
  if (createResult.uuid) return createResult.uuid;
  if (Array.isArray(createResult) && createResult[0]?.uuid) return createResult[0].uuid;
  if (createResult.documents?.[0]?.uuidDoc) return createResult.documents[0].uuidDoc;
  return null;
}

module.exports = { generateAndSendContract };
