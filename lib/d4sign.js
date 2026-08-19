'use strict';

const crypto = require('crypto');
const config = require('../config');
const http = require('./http');
const { ErroApp } = require('./erros');
const log = require('./log');

// ------------------------------------------------------------------
// Cliente para a API REST da D4Sign (assinatura eletronica de
// contratos). Docs: https://docapi.d4sign.com.br/
// ------------------------------------------------------------------

function exigirConfiguracao() {
  if (!config.d4sign.configurado) {
    throw new ErroApp('D4Sign não configurado (D4SIGN_TOKEN_API/CRYPT_KEY/UUID_SAFE/TEMPLATE_ID).', {
      status: 503,
      codigo: 'd4sign_nao_configurado',
    });
  }
}

function urlComAuth(caminho, extra = {}) {
  const params = new URLSearchParams({
    tokenAPI: config.d4sign.tokenApi,
    cryptKey: config.d4sign.cryptKey,
    ...extra,
  });
  return `${config.d4sign.baseUrl}/api/v1${caminho}?${params.toString()}`;
}

/**
 * Cria um documento a partir do template Word cadastrado no Banco de
 * Minutas do D4Sign. Devolve o UUID do documento criado.
 */
async function criarDocumentoDoTemplate({ nomeDocumento }) {
  exigirConfiguracao();
  const corpo = { name_document: nomeDocumento, id_template: [config.d4sign.templateId] };
  if (config.d4sign.uuidFolder) corpo.uuid_folder = config.d4sign.uuidFolder;

  const resposta = await http.json(
    urlComAuth(`/documents/${config.d4sign.uuidSafe}/makedocumentbytemplateword`),
    { metodo: 'POST', corpo, rotulo: 'D4Sign' },
  );
  log.info('D4Sign: documento criado a partir do template', resposta);

  const uuid = resposta?.uuid
    || (Array.isArray(resposta) && resposta[0]?.uuid)
    || resposta?.documents?.[0]?.uuidDoc
    || null;
  if (!uuid) {
    throw new ErroApp('Não foi possível extrair o UUID do documento criado no D4Sign.', {
      status: 502,
      codigo: 'd4sign_resposta_inesperada',
      detalhes: resposta,
    });
  }
  return uuid;
}

/** Cadastra o(s) signatario(s) do documento. act "1" = Assinar. */
async function cadastrarSignatarios(documentoUuid, signatarios) {
  exigirConfiguracao();
  await http.json(urlComAuth(`/documents/${documentoUuid}/createlist`), {
    metodo: 'POST',
    corpo: { signers: signatarios },
    rotulo: 'D4Sign',
  });
  log.info(`D4Sign: ${signatarios.length} signatário(s) cadastrado(s) no documento ${documentoUuid}`);
}

/** Envia o documento para a fila de assinatura (dispara e-mail aos signatarios). */
async function enviarParaAssinatura(documentoUuid, mensagem = 'Segue contrato para assinatura.') {
  exigirConfiguracao();
  await http.json(urlComAuth(`/documents/${documentoUuid}/sendtosign`), {
    metodo: 'POST',
    corpo: { message: mensagem, skip_email: '0', workflow: '0' },
    rotulo: 'D4Sign',
  });
  log.info(`D4Sign: documento ${documentoUuid} enviado para assinatura`);
}

async function cancelarDocumento(documentoUuid, comentario = 'Cancelado pela integração Bitrix24.') {
  exigirConfiguracao();
  return http.json(urlComAuth(`/documents/${documentoUuid}/cancel`), {
    metodo: 'POST',
    corpo: { comment: comentario },
    rotulo: 'D4Sign',
  });
}

/**
 * Valida a assinatura HMAC enviada pela D4Sign no header "Content-Hmac"
 * (formato "sha256=<hash>"), calculada sobre o UUID do documento com a
 * D4SIGN_HMAC_SECRET.
 * Docs: https://docapi.d4sign.com.br/docs/seguranca-de-webhook
 */
function validarAssinaturaWebhook(documentoUuid, cabecalhoHmac) {
  if (!config.d4sign.hmacSecret) {
    log.aviso('D4SIGN_HMAC_SECRET não configurada — pulando validação de assinatura do webhook (inseguro).');
    return true;
  }
  if (!cabecalhoHmac) return false;

  const recebido = String(cabecalhoHmac).replace(/^sha256=/, '').trim();
  const esperado = crypto.createHmac('sha256', config.d4sign.hmacSecret).update(documentoUuid).digest('hex');

  try {
    const a = Buffer.from(recebido, 'hex');
    const b = Buffer.from(esperado, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

module.exports = {
  criarDocumentoDoTemplate,
  cadastrarSignatarios,
  enviarParaAssinatura,
  cancelarDocumento,
  validarAssinaturaWebhook,
};
