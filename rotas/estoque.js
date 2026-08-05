'use strict';

const express = require('express');
const { z } = require('zod');

const estoque = require('../lib/estoque');
const { rota } = require('../lib/erros');
const { validarCorpo } = require('./comum');

const router = express.Router();

router.get('/produtos', rota(async (req, res) => {
  res.json(estoque.listarProdutos());
}));

router.get('/posicoes', rota(async (req, res) => {
  res.json(estoque.listarEstoque());
}));

router.get('/movimentacoes', rota(async (req, res) => {
  const produtoId = req.query.produto_id ? parseInt(req.query.produto_id, 10) : null;
  res.json(estoque.listarMovimentacoes(produtoId));
}));

const esquemaMovimentacao = z.object({
  produto_id: z.number().int().positive(),
  local_id: z.number().int().positive(),
  tipo: z.enum(['entrada', 'saida', 'ajuste']),
  quantidade: z.number().int(), // Para ajuste pode ser negativo
  motivo: z.string().trim().max(255).optional().nullable(),
  referencia: z.string().trim().max(100).optional().nullable()
});

router.post('/movimentacoes', validarCorpo(esquemaMovimentacao), rota(async (req, res) => {
  const mov = estoque.registrarMovimentacao({
    produto_id: req.dados.produto_id,
    local_id: req.dados.local_id,
    tipo: req.dados.tipo,
    quantidade: req.dados.quantidade,
    motivo: req.dados.motivo,
    usuario_email: req.session.usuario.email,
    referencia: req.dados.referencia
  });
  res.status(201).json(mov);
}));

module.exports = router;
