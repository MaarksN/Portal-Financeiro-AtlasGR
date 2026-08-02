'use strict';

const crypto = require('crypto');

const config = require('../config');
const http = require('./http');

// ------------------------------------------------------------------
// Caminho de ESCRITA no Bitrix: reaproveita exatamente o contrato que
// o ERP já usa hoje — POST /evento, corpo { evento, id, dados },
// assinado com HMAC SHA-256 usando o mesmo SEGREDO_ENTRADA.
//
// O `id` é a chave de idempotência: se o portal reenviar (usuário
// clicou duas vezes, retry da fila do espelho), o serviço detecta e
// não duplica a ação no Bitrix. Por isso a fila do espelho pode
// repetir à vontade — ver lib/espelho.js.
// ------------------------------------------------------------------

const configurado = () => config.integracao.configurado;

async function dispararEvento(evento, id, dados) {
  if (!configurado()) {
    throw new Error('INTEGRACAO_URL e SEGREDO_ENTRADA não configurados.');
  }

  const corpo = JSON.stringify({ evento, id, dados });
  const assinatura = crypto.createHmac('sha256', config.integracao.segredo).update(corpo).digest('hex');

  return http.json(`${config.integracao.url}/evento`, {
    metodo: 'POST',
    corpo,
    cabecalhos: {
      'Content-Type': 'application/json',
      'X-Atlas-Assinatura': `sha256=${assinatura}`,
    },
    rotulo: 'serviço de integração',
    // A fila do espelho já faz backoff persistente; aqui basta uma
    // repetição rápida para engasgo de rede.
    tentativas: 2,
    timeoutMs: 12000,
  });
}

module.exports = { configurado, dispararEvento };
