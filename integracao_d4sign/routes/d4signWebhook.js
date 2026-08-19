const express = require("express");
const multer = require("multer");
const d4sign = require("../clients/d4sign");
const logger = require("../logger");
const { handleD4signEvent } = require("../services/syncService");

const router = express.Router();

// A D4Sign dispara o webhook como multipart/form-data (nao JSON e nao
// x-www-form-urlencoded). multer().none() faz o parse dos campos de texto
// do form-data para req.body, sem esperar nenhum arquivo.
const parseFormData = multer().none();

router.post("/", parseFormData, async (req, res) => {
  const payload = req.body;
  const hmacHeader = req.headers["content-hmac"];

  if (!payload?.uuid) {
    logger.warn("Webhook D4Sign recebido sem uuid no corpo:", payload);
    return res.status(400).send("uuid ausente");
  }

  const valid = d4sign.verifyWebhookSignature(payload.uuid, hmacHeader);
  if (!valid) {
    logger.error(`Webhook D4Sign: assinatura HMAC invalida para o documento ${payload.uuid}.`);
    return res.status(401).send("assinatura invalida");
  }

  try {
    await handleD4signEvent(payload);
    // A D4Sign so precisa de um 2xx para nao reenviar o webhook.
    res.status(200).send("ok");
  } catch (err) {
    logger.error("Erro ao processar webhook do D4Sign:", err.message);
    // Devolve 500 para a D4Sign tentar reenviar depois (ver politica de retentativas).
    res.status(500).send("erro interno");
  }
});

module.exports = router;
