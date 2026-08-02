'use strict';

const express = require('express');
const { z } = require('zod');

const chamados = require('../lib/chamados');
const { rota } = require('../lib/erros');
const { validarCorpo, filtrosDaQuery, booleanoDaQuery } = require('./comum');

const router = express.Router();

router.get('/opcoes', (req, res) => {
  res.json({ categorias: chamados.CATEGORIAS, prioridades: chamados.PRIORIDADES });
});

router.get('/', rota(async (req, res) => {
  const filtros = filtrosDaQuery(req.query, ['status', 'prioridade', 'busca']);
  res.json(chamados.listar({
    usuario: req.session.usuario,
    ...filtros,
    todos: booleanoDaQuery(req.query.todos),
  }));
}));

router.get('/resumo', (req, res) => {
  res.json(chamados.resumoDe(req.session.usuario, { todos: booleanoDaQuery(req.query.todos) }));
});

const esquemaAbertura = z.object({
  categoria: z.string().trim().min(1, 'Escolha a categoria.'),
  prioridade: z.string().trim().min(1, 'Escolha a prioridade.'),
  resumo: z.string().trim().min(5, 'Descreva o assunto em pelo menos 5 caracteres.').max(200),
  descricao: z.string().trim().max(5000).optional().nullable(),
});

router.post('/', validarCorpo(esquemaAbertura), rota(async (req, res) => {
  const chamado = await chamados.abrir({ usuario: req.session.usuario, ...req.dados });
  res.status(201).json(chamado);
}));

router.post('/sincronizar', rota(async (req, res) => {
  res.json(await chamados.sincronizarDoSolicitante(req.session.usuario));
}));

router.get('/:id', rota(async (req, res) => {
  res.json(await chamados.obter(Number(req.params.id), req.session.usuario));
}));

const esquemaComentario = z.object({
  texto: z.string().trim().min(1, 'Escreva o comentário.').max(3000),
});

router.post('/:id/comentarios', validarCorpo(esquemaComentario), rota(async (req, res) => {
  res.json(await chamados.comentar(Number(req.params.id), req.session.usuario, req.dados.texto));
}));

module.exports = router;
