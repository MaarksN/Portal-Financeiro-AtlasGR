// ============================================================================
// Cliente/adaptador para o NXFacil (ERP - https://www.nxfacil.com.br).
//
// ATENCAO: a NXFacil nao publica documentacao de API em seu site. Nao existe
// hoje forma de confirmar os endpoints/payload exatos sem contato direto com
// o suporte da empresa:
//   Telefone/WhatsApp comercial: 47 99245-9073
//   Telefone/WhatsApp atendimento: 47 99602-0333
//   Site: https://www.nxfacil.com.br
//
// Por isso este modulo funciona em dois modos, controlados por NXFACIL_MODE:
//
//   "mock" (padrao) - nao chama nenhuma API externa. Apenas registra a
//        intencao (quem precisaria de boleto/nota fiscal gerados) para que
//        a rotina mensal continue util (relatorio) mesmo sem integracao
//        real ainda. Use isso ate obter a documentacao oficial.
//
//   "http" - faz chamadas HTTP genéricas e autenticadas (Bearer token) para
//        NXFACIL_BASE_URL + NXFACIL_BOLETO_PATH / NXFACIL_NOTA_PATH. Ajuste
//        os nomes de campo em buildBoletoPayload/buildNotaPayload assim que
//        tiver a documentacao real da NXFacil em maos - esses dois pontos
//        foram deixados isolados exatamente para essa troca ser rapida.
// ============================================================================

const axios = require("axios");
const config = require("../config");
const logger = require("../logger");

function httpClient() {
  if (!config.nxfacil.baseUrl) {
    throw new Error("NXFACIL_BASE_URL nao configurada (necessaria quando NXFACIL_MODE=http)");
  }
  return axios.create({
    baseURL: config.nxfacil.baseUrl,
    timeout: 20000,
    headers: {
      Authorization: `Bearer ${config.nxfacil.apiToken}`,
      "Content-Type": "application/json",
    },
  });
}

// ---- Ajuste estes dois "builders" quando tiver a doc oficial da NXFacil ----

function buildBoletoPayload(cobranca) {
  return {
    cliente_nome: cobranca.clientName,
    cliente_documento: cobranca.clientCpfCnpj,
    valor: cobranca.value,
    vencimento: cobranca.dueDate, // "YYYY-MM-DD"
    referencia_externa: cobranca.dealId,
    descricao: `Mensalidade - ${cobranca.dealTitle}`,
  };
}

function buildNotaPayload(cobranca) {
  return {
    cliente_nome: cobranca.clientName,
    cliente_documento: cobranca.clientCpfCnpj,
    valor: cobranca.value,
    referencia_externa: cobranca.dealId,
    descricao_servico: cobranca.plano || cobranca.dealTitle,
  };
}

// -----------------------------------------------------------------------

async function gerarBoleto(cobranca) {
  if (config.nxfacil.mode === "mock") {
    logger.warn(`NXFacil [mock]: geraria boleto de R$ ${cobranca.value} para ${cobranca.clientName} (deal ${cobranca.dealId}).`);
    return { status: "mock", payload: buildBoletoPayload(cobranca) };
  }

  const payload = buildBoletoPayload(cobranca);
  const { data } = await httpClient().post(config.nxfacil.boletoPath, payload);
  logger.info(`NXFacil: boleto gerado para o deal ${cobranca.dealId}`);
  return { status: "ok", response: data };
}

async function emitirNotaFiscal(cobranca) {
  if (config.nxfacil.mode === "mock") {
    logger.warn(`NXFacil [mock]: emitiria nota fiscal de R$ ${cobranca.value} para ${cobranca.clientName} (deal ${cobranca.dealId}).`);
    return { status: "mock", payload: buildNotaPayload(cobranca) };
  }

  const payload = buildNotaPayload(cobranca);
  const { data } = await httpClient().post(config.nxfacil.notaPath, payload);
  logger.info(`NXFacil: nota fiscal emitida para o deal ${cobranca.dealId}`);
  return { status: "ok", response: data };
}

module.exports = { gerarBoleto, emitirNotaFiscal };
