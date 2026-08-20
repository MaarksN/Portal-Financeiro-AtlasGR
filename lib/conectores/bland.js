'use strict';

const config = require('../../config');
const http = require('../http');
const dinheiro = require('../dinheiro');
const log = require('../log');
const auditoria = require('../auditoria');
const cobrancas = require('../cobrancas');
const { ErroApp } = require('../erros');

// ------------------------------------------------------------------
// Conector Bland.ai: chamadas de voz com IA para régua de cobrança,
// follow-up de contratos e confirmação de promessa de pagamento.
// ------------------------------------------------------------------

function exigirConfiguracao() {
  if (!config.bland?.apiKey) {
    throw new ErroApp('BLAND_AI_API_KEY não configurada no .env.', {
      status: 503,
      codigo: 'bland_nao_configurada',
    });
  }
}

/**
 * Dispara uma chamada telefônica ativa através da Bland AI
 */
async function dispararLigacaoCobranca({
  telefone,
  nomeCliente,
  valorCentavos,
  vencimento,
  faturaId,
  usuarioEmail = 'sistema@atlasgr.com.br',
}) {
  exigirConfiguracao();

  const valorFormatado = dinheiro.formatar(valorCentavos);
  const prompt = [
    `Você é a Sofia, assistente financeira do departamento de relacionamento da AtlasGR e Total Trac.`,
    `Você está ligando para ${nomeCliente} para tratar cordialmente sobre a fatura #${faturaId || ''} no valor de ${valorFormatado}, com vencimento em ${vencimento}.`,
    `Objetivo: Lembrar gentilmente do vencimento, perguntar se houve alguma dificuldade no recebimento do boleto ou nota fiscal, e obter uma data prevista para liquidação ou envio do comprovante.`,
    `Se o cliente informar uma data de pagamento (promessa), confirme a data e finalize com simpatia.`,
    `Fale português do Brasil de forma natural, profissional, empática e objetiva.`,
  ].join(' ');

  const corpo = await http.json(`${config.bland.baseUrl}/calls`, {
    metodo: 'POST',
    cabecalhos: {
      'authorization': config.bland.apiKey,
      'Content-Type': 'application/json',
    },
    corpo: {
      phone_number: telefone,
      task: prompt,
      voice: 'maya',
      language: 'pt-BR',
      record: true,
      metadata: {
        faturaId: String(faturaId || ''),
        nomeCliente,
        valorCentavos,
      },
    },
    timeoutMs: 20000,
    rotulo: 'Bland.ai Chamada',
  });

  auditoria.registrar({
    ator: usuarioEmail,
    acao: 'bland.ligacao_disparada',
    entidade: 'cobranca',
    detalhe: { telefone, faturaId, callId: corpo?.call_id },
  });

  log.info(`Bland.ai: ligação disparada para ${telefone} (fatura #${faturaId}, callId: ${corpo?.call_id}).`);

  return {
    sucesso: true,
    callId: corpo?.call_id,
    status: corpo?.status,
  };
}

/**
 * Consulta os detalhes e transcrição de uma chamada
 */
async function consultarChamada(callId) {
  exigirConfiguracao();

  return http.json(`${config.bland.baseUrl}/calls/${callId}`, {
    metodo: 'GET',
    cabecalhos: {
      'authorization': config.bland.apiKey,
    },
    rotulo: 'Bland.ai Consulta',
  });
}

/**
 * Processa webhook de retorno da chamada da Bland AI
 */
async function processarWebhook(payload) {
  const { call_id: callId, transcripts, summary, metadata, concatenated_transcript: transcript } = payload;
  const faturaId = metadata?.faturaId ? Number(metadata.faturaId) : null;

  log.info(`Bland.ai webhook recebido: callId ${callId}, fatura #${faturaId}.`);

  if (faturaId) {
    // Registra o contato na régua de cobrança
    const resumoContato = summary || (transcript ? transcript.slice(0, 200) : 'Ligação realizada via agente de voz IA.');
    
    try {
      cobrancas.registrarContato(
        faturaId,
        {
          canal: 'telefone',
          observacao: `[IA Bland.ai] ${resumoContato}`,
        },
        'bland.ai@atlasgr.com.br',
      );
    } catch (err) {
      log.aviso(`Erro ao registrar contato da Bland AI na fatura #${faturaId}: ${err.message}`);
    }
  }

  return { tratado: true, callId };
}

module.exports = {
  dispararLigacaoCobranca,
  consultarChamada,
  processarWebhook,
};
