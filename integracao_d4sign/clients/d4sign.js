// Cliente para a API REST da D4Sign (assinatura eletronica).
// Docs oficiais: https://docapi.d4sign.com.br/
//
// Endpoints usados aqui foram confirmados na documentacao publica em
// agosto/2026:
//  - POST /documents/{uuid-safe}/makedocumentbytemplateword
//  - POST /documents/{uuid}/createlist
//  - POST /documents/{uuid}/sendtosign
//  - POST /documents/{uuid}/cancel
//  - GET  /documents/{uuid}
// Antes de ir para producao, confira cada payload em
// https://docapi.d4sign.com.br/reference (a D4Sign atualiza a API com
// alguma frequencia).

const axios = require("axios");
const crypto = require("crypto");
const config = require("../config");
const logger = require("../logger");

function client() {
  return axios.create({
    baseURL: `${config.d4sign.baseUrl}/api/v1`,
    timeout: 30000,
    headers: { "Content-Type": "application/json" },
  });
}

function authParams(extra = {}) {
  return {
    tokenAPI: config.d4sign.tokenApi,
    cryptKey: config.d4sign.cryptKey,
    ...extra,
  };
}

/**
 * Cria um documento a partir de um template Word cadastrado no
 * "Banco de Minutas" do D4Sign.
 *
 * IMPORTANTE: este endpoint basico (makedocumentbytemplateword) apenas
 * gera o documento a partir do template, com o nome informado. Para
 * SUBSTITUIR variaveis/campos dentro do template (ex.: {{nome_cliente}}),
 * a D4Sign usa o fluxo de "preenchedores" (endpoint
 * documento-a-partir-do-template-word-copy). Verifique com o time da
 * D4Sign / na documentacao qual variante seu template usa e ajuste a
 * funcao `fillers` abaixo antes de ir para producao.
 */
async function createDocumentFromTemplate({ documentName, fillers }) {
  const body = {
    name_document: documentName,
    id_template: [config.d4sign.templateId],
  };
  if (config.d4sign.uuidFolder) body.uuid_folder = config.d4sign.uuidFolder;

  // Encaminha os campos de preenchimento, se o seu template usar a variante
  // "com mais de um preenchedor". Ver comentario acima.
  if (fillers) body.templates = fillers;

  const { data } = await client().post(
    `/documents/${config.d4sign.uuidSafe}/makedocumentbytemplateword`,
    body,
    { params: authParams() }
  );
  logger.info("D4Sign: documento criado a partir do template", data);
  // A resposta traz o UUID do documento criado (confira o campo exato na
  // sua conta - normalmente "uuid" ou dentro de um array).
  return data;
}

/**
 * Cadastra o(s) signatario(s) do documento.
 * act "1" = Assinar (padrao). Veja outros codigos na documentacao.
 */
async function addSigners(documentUuid, signers) {
  const { data } = await client().post(
    `/documents/${documentUuid}/createlist`,
    { signers },
    { params: authParams() }
  );
  logger.info(`D4Sign: ${signers.length} signatario(s) cadastrado(s) no documento ${documentUuid}`);
  return data;
}

/** Envia o documento para a fila de assinatura (dispara e-mail/whatsapp aos signatarios). */
async function sendToSign(documentUuid, message = "Segue contrato para assinatura.") {
  const { data } = await client().post(
    `/documents/${documentUuid}/sendtosign`,
    { message, skip_email: "0", workflow: "0" },
    { params: authParams() }
  );
  logger.info(`D4Sign: documento ${documentUuid} enviado para assinatura`);
  return data;
}

async function cancelDocument(documentUuid, comment = "Cancelado pela integracao Bitrix24.") {
  const { data } = await client().post(
    `/documents/${documentUuid}/cancel`,
    { comment },
    { params: authParams() }
  );
  return data;
}

async function getDocument(documentUuid) {
  const { data } = await client().get(`/documents/${documentUuid}`, { params: authParams() });
  return data;
}

/**
 * Registra a URL de webhook para o documento (alternativa a registrar
 * manualmente pelo painel do D4Sign, em cada documento, ou uma unica vez
 * no nivel do cofre - ver docs "Cadastrar Webhook em um documento").
 */
async function registerWebhook(documentUuid, url) {
  const { data } = await client().post(
    `/documents/${documentUuid}/webhook`,
    { url },
    { params: authParams() }
  );
  return data;
}

/**
 * Valida a assinatura HMAC enviada pela D4Sign no header "Content-Hmac"
 * (formato "sha256=<hash>"). Calcula HMAC-SHA256 do UUID do documento
 * usando a D4SIGN_HMAC_SECRET (gerada em "Minha area de API" > "Gerar
 * Secret Key MAC") e compara com o valor recebido.
 * Docs: https://docapi.d4sign.com.br/docs/seguranca-de-webhook
 */
function verifyWebhookSignature(documentUuid, contentHmacHeader) {
  if (!config.d4sign.hmacSecret) {
    logger.warn("D4SIGN_HMAC_SECRET nao configurada - pulando validacao de assinatura do webhook (INSEGURO).");
    return true;
  }
  if (!contentHmacHeader) return false;

  const received = contentHmacHeader.replace(/^sha256=/, "").trim();
  const expected = crypto
    .createHmac("sha256", config.d4sign.hmacSecret)
    .update(documentUuid)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

module.exports = {
  createDocumentFromTemplate,
  addSigners,
  sendToSign,
  cancelDocument,
  getDocument,
  registerWebhook,
  verifyWebhookSignature,
};
