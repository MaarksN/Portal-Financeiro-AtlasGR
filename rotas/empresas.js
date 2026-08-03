'use strict';

const express = require('express');
const { z } = require('zod');

const empresas = require('../lib/empresas');
const { rota } = require('../lib/erros');
const { validarCorpo } = require('./comum');
const { exigirPapel } = require('../lib/seguranca');

const router = express.Router();

router.use(exigirPapel('admin'));

const esquemaEmpresa = z.object({
  cnpj: z.string().min(14, 'CNPJ inválido'),
  razao_social: z.string().min(1, 'Razão social é obrigatória'),
  nome_fantasia: z.string().optional(),
  ativo: z.number().int().optional(),
});

const esquemaFilial = z.object({
  cnpj: z.string().min(14, 'CNPJ inválido'),
  nome: z.string().min(1, 'Nome é obrigatório'),
  ativo: z.number().int().optional(),
});

router.get('/', rota(async (req, res) => {
  res.json(empresas.listarEmpresas());
}));

router.post('/', validarCorpo(esquemaEmpresa), rota(async (req, res) => {
  res.status(201).json(empresas.criarEmpresa(req.dados, req.session.usuario.email));
}));

router.get('/:id/filiais', rota(async (req, res) => {
  res.json(empresas.listarFiliais(Number(req.params.id)));
}));

router.post('/:id/filiais', validarCorpo(esquemaFilial), rota(async (req, res) => {
  res.status(201).json(empresas.criarFilial(Number(req.params.id), req.dados, req.session.usuario.email));
}));

module.exports = router;
