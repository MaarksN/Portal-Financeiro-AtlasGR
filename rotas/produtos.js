'use strict';

const express = require('express');
const produtos = require('../lib/produtos');
const { exigirPapel } = require('../lib/seguranca');

const router = express.Router();

const soVendas = exigirPapel('vendedor', 'gestor_comercial', 'admin');

router.use(soVendas);

router.get('/', (req, res) => {
  res.json(produtos.listar());
});

router.get('/:id', (req, res) => {
  res.json(produtos.porId(Number(req.params.id)));
});

router.post('/', (req, res) => {
  const produto = produtos.criar(req.body, req.session.usuario.email);
  res.status(201).json(produto);
});

router.put('/:id', (req, res) => {
  const produto = produtos.atualizar(Number(req.params.id), req.body, req.session.usuario.email);
  res.json(produto);
});

module.exports = router;
