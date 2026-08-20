'use strict';

const express = require('express');
const { rota } = require('../lib/erros');
const { exigirPapel } = require('../lib/seguranca');
const contratos = require('../lib/contratos');
const cobrancaMensal = require('../lib/cobrancaMensal');
const painel = require('../lib/contratosPainel');

const router = express.Router();

router.use(exigirPapel('comercial', 'financeiro', 'admin'));

router.get('/carteira', rota(async (req, res) => {
  res.json(painel.montarCarteira());
}));

router.get('/kpis', rota(async (req, res) => {
  res.json(painel.montarKpis());
}));

router.get('/alertas', rota(async (req, res) => {
  res.json(painel.montarAlertas());
}));

router.get('/previa-campos/:dealId', rota(async (req, res) => {
  const dealId = req.params.dealId;
  const origem = req.query.origem || 'atlasgr';
  const previa = await contratos.buscarPreviaCampos(dealId, origem);
  res.json({ ok: true, previa });
}));

router.post('/gerar-contrato', rota(async (req, res) => {
  const dealId = req.body?.dealId;
  const origem = req.body?.origem || 'atlasgr';
  if (!dealId) return res.status(400).json({ erro: 'dealId não informado.' });
  const resultado = await contratos.gerarEEnviarContrato(dealId, origem);
  res.json(resultado);
}));

router.post('/rodar-cobranca', rota(async (req, res) => {
  const resumo = await cobrancaMensal.rodarCobrancaMensal();
  res.json(resumo);
}));

module.exports = router;
