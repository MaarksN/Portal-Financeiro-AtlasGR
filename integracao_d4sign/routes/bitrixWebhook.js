const express = require("express");
const config = require("../config");
const logger = require("../logger");
const { generateAndSendContract } = require("../services/contractService");

const router = express.Router();

/**
 * Endpoint chamado PELO Bitrix24 (via Regra de Automacao / Robo no estagio
 * de funil configurado, ou via um botao/webhook de saida) para disparar a
 * geracao do contrato no D4Sign.
 *
 * Protegido por um segredo simples via query string ou header, definido em
 * INTERNAL_WEBHOOK_SECRET (o Bitrix24 nao suporta assinatura HMAC nativa
 * em regras de automacao simples, entao usamos um "shared secret").
 *
 * Exemplo de URL a configurar no Bitrix24:
 *   https://SEU-SERVICO.onrender.com/webhooks/bitrix/gerar-contrato?dealId={{ID}}&secret=SEU_SEGREDO
 */
router.post("/gerar-contrato", async (req, res) => {
  const secret = req.query.secret || req.headers["x-webhook-secret"];
  if (secret !== config.internalWebhookSecret) {
    return res.status(401).json({ error: "Segredo invalido." });
  }

  const dealId = req.query.dealId || req.body?.dealId || req.body?.document_id?.[2];
  if (!dealId) {
    return res.status(400).json({ error: "dealId nao informado." });
  }

  try {
    const result = await generateAndSendContract(dealId);
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error(`Falha ao gerar contrato para o deal ${dealId}:`, err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
