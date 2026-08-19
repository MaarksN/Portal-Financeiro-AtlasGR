'use strict';

const express = require('express');
const multer = require('multer');
const config = require('../config');
const log = require('../lib/log');
const d4sign = require('../lib/d4sign');
const contratos = require('../lib/contratos');

const router = express.Router();

// ------------------------------------------------------------------
// Rotas públicas (sem sessão) chamadas por sistemas externos — Bitrix24
// e D4Sign não sabem fazer login. Protegidas por segredo compartilhado
// (Bitrix) e por assinatura HMAC (D4Sign), não pela sessão do portal.
// Ficam fora de /api de propósito (ver rotas/index.js).
// ------------------------------------------------------------------

/**
 * Chamada PELO Bitrix24 (Regra de Automação no estágio "gerar
 * contrato") para disparar a geração do contrato no D4Sign.
 *   https://SEU-PORTAL/webhooks/bitrix/gerar-contrato?dealId={{ID}}&secret=SEU_SEGREDO
 */
router.post('/bitrix/gerar-contrato', async (req, res) => {
  const segredo = req.query.secret || req.headers['x-webhook-secret'];
  if (!config.contratosWebhookSecret || segredo !== config.contratosWebhookSecret) {
    return res.status(401).json({ erro: 'Segredo inválido.' });
  }

  const dealId = req.query.dealId || req.body?.dealId || req.body?.document_id?.[2];
  if (!dealId) return res.status(400).json({ erro: 'dealId não informado.' });

  try {
    const resultado = await contratos.gerarEEnviarContrato(dealId);
    res.json({ ok: true, ...resultado });
  } catch (erro) {
    log.erro(`Falha ao gerar contrato para o deal ${dealId}`, { erro: erro.message });
    res.status(erro.status || 500).json({ ok: false, erro: erro.message });
  }
});

// A D4Sign dispara o webhook como multipart/form-data. multer().none()
// faz o parse dos campos de texto pra req.body, sem esperar arquivo.
const parseFormData = multer().none();

router.post('/d4sign', parseFormData, async (req, res) => {
  const payload = req.body;
  const cabecalhoHmac = req.headers['content-hmac'];

  if (!payload?.uuid) {
    log.aviso('Webhook D4Sign recebido sem uuid no corpo.', { payload });
    return res.status(400).send('uuid ausente');
  }

  if (!d4sign.validarAssinaturaWebhook(payload.uuid, cabecalhoHmac)) {
    log.erro(`Webhook D4Sign: assinatura HMAC inválida para o documento ${payload.uuid}.`);
    return res.status(401).send('assinatura inválida');
  }

  try {
    await contratos.tratarEventoD4sign(payload);
    res.status(200).send('ok');
  } catch (erro) {
    log.erro('Erro ao processar webhook do D4Sign', { erro: erro.message });
    res.status(500).send('erro interno');
  }
});

module.exports = router;
