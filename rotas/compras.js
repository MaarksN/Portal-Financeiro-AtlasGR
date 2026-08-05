'use strict';

const express = require('express');
const { z } = require('zod');

const compras = require('../lib/compras');
const { rota } = require('../lib/erros');
const { validarCorpo } = require('./comum');

const router = express.Router();

router.get('/fornecedores', rota(async (req, res) => {
  res.json(compras.listarFornecedores());
}));

router.get('/solicitacoes', rota(async (req, res) => {
  res.json(compras.listarSolicitacoes());
}));

const esquemaSolicitacao = z.object({
  centro_custo: z.string().trim().optional().nullable(),
  justificativa: z.string().trim().min(5, 'Forneça uma justificativa').max(500),
  itens: z.array(z.object({
    produto_id: z.number().int().positive(),
    quantidade: z.number().int().positive()
  })).min(1, 'Adicione pelo menos um item.')
});

router.post('/solicitacoes', validarCorpo(esquemaSolicitacao), rota(async (req, res) => {
  const solicitacao = compras.criarSolicitacao({
    solicitante_email: req.session.usuario.email,
    centro_custo: req.dados.centro_custo,
    justificativa: req.dados.justificativa,
    itens: req.dados.itens,
  });
  res.status(201).json(solicitacao);
}));

module.exports = router;
