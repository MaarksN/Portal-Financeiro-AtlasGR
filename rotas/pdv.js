'use strict';

const express = require('express');
const { exigirPapel } = require('../lib/seguranca');
const pdv = require('../lib/pdv');
const fiscal = require('../lib/fiscal');

const router = express.Router();
router.use(exigirPapel('operador_caixa'));

router.get('/caixas', (req, res) => {
  res.json(pdv.listarCaixas());
});

router.get('/sessao', (req, res) => {
  const sessao = pdv.buscarSessaoAberta(req.session.usuario.email);
  if (sessao) {
    sessao.saldoEsperado = pdv.calcularSaldoEsperado(sessao.id);
  }
  res.json({ sessao });
});

router.post('/abrir', (req, res) => {
  const { caixaId, saldoInicialCentavos } = req.body;
  const sessao = pdv.abrirCaixa(caixaId, req.session.usuario.email, saldoInicialCentavos);
  res.json(sessao);
});

router.post('/fechar', (req, res) => {
  const { sessaoId, saldoInformadoCentavos } = req.body;
  const sessao = pdv.fecharCaixa(sessaoId, req.session.usuario.email, saldoInformadoCentavos);
  res.json(sessao);
});

router.post('/movimentacao', (req, res) => {
  const { sessaoId, tipo, valorCentavos, justificativa } = req.body;
  const mov = pdv.registrarMovimentacao(sessaoId, req.session.usuario.email, tipo, valorCentavos, justificativa);
  res.json(mov);
});

router.post('/venda', async (req, res, next) => {
  try {
    const { sessaoId, clienteNome, clienteDoc, itens, pagamentos, descontosCentavos } = req.body;

    // Registrar venda sincronicamente no DB
    const venda = pdv.registrarVenda(sessaoId, req.session.usuario.email, {
      clienteNome, clienteDoc, itens, pagamentos, descontosCentavos
    });

    // Disparar emissão fiscal de forma não-bloqueante
    fiscal.emitirNFCe(venda.id).catch(err => console.error('Erro na emissão fiscal assíncrona:', err));

    res.json(venda);
  } catch (err) {
    next(err);
  }
});

router.get('/vendas/:sessaoId', (req, res) => {
  res.json(pdv.listarVendas(req.params.sessaoId));
});

module.exports = router;
