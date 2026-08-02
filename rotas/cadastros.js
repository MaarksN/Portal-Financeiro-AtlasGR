'use strict';

const express = require('express');
const { z } = require('zod');

const cadastros = require('../lib/cadastros');
const { rota } = require('../lib/erros');
const { validarCorpo } = require('./comum');
const { exigirPapel } = require('../lib/seguranca');

const router = express.Router();

router.use(exigirPapel('admin', 'financeiro', 'comercial', 'comprador', 'estoquista'));

const esquemaPessoa = z.object({
  documento: z.string().min(11, 'Documento inválido'),
  nome: z.string().min(1, 'Nome é obrigatório'),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  telefone: z.string().optional(),
});

const esquemaProduto = z.object({
  codigo: z.string().optional(),
  nome: z.string().min(1, 'Nome é obrigatório'),
  descricao: z.string().optional(),
  preco_centavos: z.number().int().optional(),
  ativo: z.number().int().optional(),
});

router.get('/clientes', rota(async (req, res) => res.json(cadastros.listarClientes())));
router.post('/clientes', validarCorpo(esquemaPessoa), rota(async (req, res) => {
  res.status(201).json(cadastros.criarCliente(req.dados, req.session.usuario.email));
}));

router.get('/fornecedores', rota(async (req, res) => res.json(cadastros.listarFornecedores())));
router.post('/fornecedores', validarCorpo(esquemaPessoa), rota(async (req, res) => {
  res.status(201).json(cadastros.criarFornecedor(req.dados, req.session.usuario.email));
}));

router.get('/produtos', rota(async (req, res) => res.json(cadastros.listarProdutos())));
router.post('/produtos', validarCorpo(esquemaProduto), rota(async (req, res) => {
  res.status(201).json(cadastros.criarProduto(req.dados, req.session.usuario.email));
}));

router.get('/servicos', rota(async (req, res) => res.json(cadastros.listarServicos())));
router.post('/servicos', validarCorpo(esquemaProduto), rota(async (req, res) => {
  res.status(201).json(cadastros.criarServico(req.dados, req.session.usuario.email));
}));

module.exports = router;
