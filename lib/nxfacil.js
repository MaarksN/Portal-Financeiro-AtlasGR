'use strict';

const config = require('../config');
const http = require('./http');
const log = require('./log');

// ------------------------------------------------------------------
// Cliente/adaptador para a NXFacil (ERP - boleto e nota fiscal da
// rotina mensal de cobrança). A NXFacil não publica documentação de
// API aberta, então funciona em dois modos (NXFACIL_MODE):
//
//   "mock" (padrão) — não chama nada externo, só registra a intenção,
//        pra rotina mensal continuar útil (relatório) sem integração
//        real ainda.
//   "http" — chamadas HTTP autenticadas (Bearer) pra NXFACIL_BASE_URL.
//        Ajuste os payloads abaixo com a documentação real da NXFacil.
// ------------------------------------------------------------------

function montarPayloadBoleto(cobranca) {
  return {
    cliente_nome: cobranca.clienteNome,
    cliente_documento: cobranca.clienteDocumento,
    valor: cobranca.valor,
    vencimento: cobranca.vencimento, // "YYYY-MM-DD"
    referencia_externa: cobranca.dealId,
    descricao: `Mensalidade - ${cobranca.dealTitulo}`,
  };
}

function montarPayloadNota(cobranca) {
  return {
    cliente_nome: cobranca.clienteNome,
    cliente_documento: cobranca.clienteDocumento,
    valor: cobranca.valor,
    referencia_externa: cobranca.dealId,
    descricao_servico: cobranca.plano || cobranca.dealTitulo,
  };
}

async function chamarHttp(caminho, payload) {
  if (!config.nxfacil.baseUrl) {
    throw new Error('NXFACIL_BASE_URL não configurada (necessária quando NXFACIL_MODE=http).');
  }
  return http.json(`${config.nxfacil.baseUrl}${caminho}`, {
    metodo: 'POST',
    corpo: payload,
    cabecalhos: { Authorization: `Bearer ${config.nxfacil.apiToken}` },
    rotulo: 'NXFacil',
  });
}

async function gerarBoleto(cobranca) {
  if (config.nxfacil.mode === 'mock') {
    log.aviso(`NXFacil [mock]: geraria boleto de R$ ${cobranca.valor} para ${cobranca.clienteNome} (deal ${cobranca.dealId}).`);
    return { status: 'mock', payload: montarPayloadBoleto(cobranca) };
  }
  const resposta = await chamarHttp(config.nxfacil.boletoPath, montarPayloadBoleto(cobranca));
  log.info(`NXFacil: boleto gerado para o deal ${cobranca.dealId}`);
  return { status: 'ok', resposta };
}

async function emitirNotaFiscal(cobranca) {
  if (config.nxfacil.mode === 'mock') {
    log.aviso(`NXFacil [mock]: emitiria nota fiscal de R$ ${cobranca.valor} para ${cobranca.clienteNome} (deal ${cobranca.dealId}).`);
    return { status: 'mock', payload: montarPayloadNota(cobranca) };
  }
  const resposta = await chamarHttp(config.nxfacil.notaPath, montarPayloadNota(cobranca));
  log.info(`NXFacil: nota fiscal emitida para o deal ${cobranca.dealId}`);
  return { status: 'ok', resposta };
}

module.exports = { gerarBoleto, emitirNotaFiscal };
