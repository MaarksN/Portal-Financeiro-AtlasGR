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
const pdv = require('./pdv');
const fiscal = require('./fiscal');
const empresas = require('./empresas');
const cadastros = require('./cadastros');
const financeiro = require('./financeiro');

const router = express.Router();

// /login, /logout, /api/sessao — as únicas rotas que existem sem sessão.
router.use(auth);

// Daqui pra baixo, tudo exige sessão válida.
const api = express.Router();
api.use(limiteApi, exigirSessao);

api.use('/chamados', chamados);
api.use('/reembolsos', reembolsos);
api.use('/cobrancas', cobrancas);
api.use('/admin', admin);
api.use('/compras', require('./compras'));
api.use('/estoque', require('./estoque'));
api.use('/pdv', pdv);
api.use('/fiscal', fiscal);
api.use('/empresas', empresas);
api.use('/cadastros', cadastros);
api.use('/clientes', clientes);
api.use('/produtos', produtos);
api.use('/financeiro', financeiro);

router.use('/api', api);

module.exports = router;
