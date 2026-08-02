'use strict';

const express = require('express');
const clientes = require('../lib/clientes');
const { exigirPapel } = require('../lib/seguranca');

const router = express.Router();

const soVendas = exigirPapel('vendedor', 'gestor_comercial', 'admin');

router.use(soVendas);

router.get('/', (req, res) => {
  res.json(clientes.listar());
});

router.get('/:id', (req, res) => {
  res.json(clientes.porId(Number(req.params.id)));
});

router.post('/', (req, res) => {
  const cliente = clientes.criar(req.body, req.session.usuario.email);
  res.status(201).json(cliente);
});

router.put('/:id', (req, res) => {
  const cliente = clientes.atualizar(Number(req.params.id), req.body, req.session.usuario.email);
  res.json(cliente);
});

module.exports = router;
