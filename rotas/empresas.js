'use strict';

const express = require('express');
const { z } = require('zod');

const empresas = require('../lib/empresas');
const { rota } = require('../lib/erros');
const { exigirPapel } = require('../lib/seguranca');
const { validarCorpo } = require('./comum');

const router = express.Router();

// Cadastro de empresas e filiais é decisão administrativa — só admin
// vê e mexe. Diferente de "financeiro" ou "comercial", que são papéis
// operacionais.
router.use(exigirPapel('admin'));

const esquemaEndereco = z.object({
  logradouro: z.string().trim().max(200).optional().nullable(),
  numero: z.string().trim().max(20).optional().nullable(),
  complemento: z.string().trim().max(100).optional().nullable(),
  bairro: z.string().trim().max(100).optional().nullable(),
  cidade: z.string().trim().max(100).optional().nullable(),
  uf: z.string().trim().length(2).optional().nullable(),
  cep: z.string().trim().max(9).optional().nullable(),
}).optional().nullable();

const esquemaEmpresa = z.object({
  nome: z.string().trim().min(1).max(150),
  razaoSocial: z.string().trim().max(200).optional().nullable(),
  cnpj: z.string().trim().optional().nullable(),
  inscricaoEstadual: z.string().trim().max(30).optional().nullable(),
  inscricaoMunicipal: z.string().trim().max(30).optional().nullable(),
  regimeTributario: z.enum(['simples', 'lucro_presumido', 'lucro_real']).optional(),
  endereco: esquemaEndereco,
  telefone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().email().max(150).optional().nullable().or(z.literal('')),
  site: z.string().trim().max(200).optional().nullable(),
});

const esquemaEmpresaParcial = esquemaEmpresa.partial();

const esquemaFilial = z.object({
  nome: z.string().trim().min(1).max(150),
  cnpj: z.string().trim().optional().nullable(),
  inscricaoEstadual: z.string().trim().max(30).optional().nullable(),
  inscricaoMunicipal: z.string().trim().max(30).optional().nullable(),
  endereco: esquemaEndereco,
  telefone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().email().max(150).optional().nullable().or(z.literal('')),
  principal: z.boolean().optional(),
});

const esquemaFilialParcial = esquemaFilial.partial();

router.get('/', rota(async (req, res) => res.json(empresas.listar())));

router.post('/', validarCorpo(esquemaEmpresa), rota(async (req, res) => {
  res.status(201).json(empresas.criar(req.dados, req));
}));

router.get('/:id', rota(async (req, res) => res.json(empresas.obter(Number(req.params.id)))));

router.patch('/:id', validarCorpo(esquemaEmpresaParcial), rota(async (req, res) => {
  res.json(empresas.atualizar(Number(req.params.id), req.dados, req));
}));

router.post('/:id/ativar', rota(async (req, res) => {
  res.json(empresas.definirAtiva(Number(req.params.id), true, req));
}));

router.post('/:id/desativar', rota(async (req, res) => {
  res.json(empresas.definirAtiva(Number(req.params.id), false, req));
}));

router.post('/:id/filiais', validarCorpo(esquemaFilial), rota(async (req, res) => {
  res.status(201).json(empresas.criarFilial(Number(req.params.id), req.dados, req));
}));

router.patch('/:id/filiais/:filialId', validarCorpo(esquemaFilialParcial), rota(async (req, res) => {
  res.json(empresas.atualizarFilial(Number(req.params.filialId), req.dados, req));
}));

router.post('/:id/filiais/:filialId/ativar', rota(async (req, res) => {
  res.json(empresas.definirFilialAtiva(Number(req.params.filialId), true, req));
}));

router.post('/:id/filiais/:filialId/desativar', rota(async (req, res) => {
  res.json(empresas.definirFilialAtiva(Number(req.params.filialId), false, req));
}));

module.exports = router;
