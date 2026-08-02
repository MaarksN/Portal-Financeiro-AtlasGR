'use strict';

const express = require('express');
const { exigirPapel } = require('../lib/seguranca');
const fiscal = require('../lib/fiscal');

const router = express.Router();
router.use(exigirPapel('fiscal'));

router.get('/config', (req, res) => {
  res.json(fiscal.obterConfiguracao(req.query.filial || 'Matriz'));
});

router.put('/config', (req, res) => {
  const filial = req.body.filial || 'Matriz';
  const atualizada = fiscal.configurar(filial, req.body, req.session.usuario.email);
  res.json(atualizada);
});

router.get('/notas', (req, res) => {
  res.json(fiscal.consultarNotas(50));
});

module.exports = router;
