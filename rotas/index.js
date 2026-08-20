'use strict';

const express = require('express');

const { exigirSessao, limiteApi } = require('../lib/seguranca');

const auth = require('./auth');
const reembolsos = require('./reembolsos');
const cobrancas = require('./cobrancas');
const empresas = require('./empresas');
const ia = require('./ia');
const admin = require('./admin');
const financeiro = require('./financeiro');
const fiscal = require('./fiscal');
const pdv = require('./pdv');
const cadastros = require('./cadastros');
const relatorios = require('./relatorios');
const produtos = require('./produtos');
const clientes = require('./clientes');
const contratos = require('./contratos');
const bitrix = require('./bitrix');
const webhooksContratos = require('./webhooksContratos');

const router = express.Router();

// /login, /logout, /api/sessao — as únicas rotas que existem sem sessão.
router.use(auth);

// Chamadas por sistemas externos (Bitrix24, D4Sign) — protegidas por
// segredo compartilhado / HMAC, não pela sessão do portal.
router.use('/webhooks', webhooksContratos);

// Daqui pra baixo, tudo exige sessão válida.
const api = express.Router();
api.use(limiteApi, exigirSessao);

api.use('/reembolsos', reembolsos);
api.use('/cobrancas', cobrancas);
api.use('/empresas', empresas);
api.use('/ia', ia);
api.use('/financeiro', financeiro);
api.use('/fiscal', fiscal);
api.use('/pdv', pdv);
api.use('/cadastros', cadastros);
api.use('/relatorios', relatorios);
api.use('/produtos', produtos);
api.use('/clientes', clientes);
api.use('/contratos', contratos);
api.use('/bitrix', bitrix);
api.use(admin);

router.use('/api', api);

module.exports = router;
