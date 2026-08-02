'use strict';

const express = require('express');

const { exigirSessao, limiteApi } = require('../lib/seguranca');

const auth = require('./auth');
const chamados = require('./chamados');
const reembolsos = require('./reembolsos');
const cobrancas = require('./cobrancas');
const clientes = require('./clientes');
const produtos = require('./produtos');
const admin = require('./admin');

const router = express.Router();

// /login, /logout, /api/sessao — as únicas rotas que existem sem sessão.
router.use(auth);

// Daqui pra baixo, tudo exige sessão válida.
const api = express.Router();
api.use(limiteApi, exigirSessao);

api.use('/chamados', chamados);
api.use('/reembolsos', reembolsos);
api.use('/cobrancas', cobrancas);
api.use('/clientes', clientes);
api.use('/produtos', produtos);
api.use(admin);

router.use('/api', api);

module.exports = router;
