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

router.post('/simular-geracao', rota(async (req, res) => {
  const {
    razaoSocial = 'Empresa Teste Ltda',
    cnpj = '12.345.678/0001-90',
    emailSignatario = 'diretoria@empresa.com.br',
    valor = 1500,
    vencimentoDia = '10',
    plano = 'Atlas GR Monitoramento & Gestão',
  } = req.body || {};

  const docUuid = `d4s-sim-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const passos = [
    { passo: 1, descricao: 'Mapeamento de variáveis Bitrix24 → D4Sign', status: 'concluido', detalhe: `Razão Social: ${razaoSocial} | CNPJ: ${cnpj}` },
    { passo: 2, descricao: 'Geração de documento a partir do modelo', status: 'concluido', detalhe: `Documento UUID: ${docUuid} | Modelo Safe` },
    { passo: 3, descricao: 'Cadastro de signatário e definição de alçada', status: 'concluido', detalhe: `Signatário: ${emailSignatario} (Papel: Assinar)` },
    { passo: 4, descricao: 'Envio de notificação e disparo de webhook', status: 'concluido', detalhe: `Link de assinatura gerado (Status: Enviado)` },
  ];

  res.json({
    ok: true,
    simulado: true,
    documentoUuid: docUuid,
    status: 'sent',
    razaoSocial,
    cnpj,
    emailSignatario,
    valorFormatado: `R$ ${Number(valor).toFixed(2)}`,
    vencimentoDia,
    plano,
    linkAssinatura: `https://secure.d4sign.com.br/sign/${docUuid}`,
    passos,
    criadoEm: new Date().toISOString(),
  });
}));

module.exports = router;
