'use strict';

const express = require('express');
const { z } = require('zod');
const { consultar, consultarUm, executar, agoraIso } = require('../db');

const router = express.Router();

// Apenas usuários com permissão financeira devem acessar este módulo.
router.use((req, res, next) => {
  if (!req.usuario.permissoes.financeiro && !req.usuario.permissoes.admin) {
    return res.status(403).json({ erro: 'Acesso negado. Requer permissão financeira.' });
  }
  next();
});

// ==============================
// CONTAS
// ==============================

router.get('/contas', (req, res) => {
  const contas = consultar('SELECT * FROM fin_contas ORDER BY nome');
  res.json(contas);
});

const schemaConta = z.object({
  nome: z.string().min(1),
  tipo: z.enum(['corrente', 'poupanca', 'carteira', 'caixa', 'aplicacao']),
  instituicao: z.string().optional(),
  agencia: z.string().optional(),
  numero: z.string().optional(),
  saldo_inicial_centavos: z.number().int().default(0),
});

router.post('/contas', (req, res) => {
  const dados = schemaConta.parse(req.body);
  const info = executar(
    `INSERT INTO fin_contas (nome, tipo, instituicao, agencia, numero, saldo_inicial_centavos)
     VALUES (?, ?, ?, ?, ?, ?)`,
    dados.nome, dados.tipo, dados.instituicao || null, dados.agencia || null, dados.numero || null, dados.saldo_inicial_centavos
  );
  res.status(201).json({ id: info.lastInsertRowid });
});

// ==============================
// CATEGORIAS
// ==============================

router.get('/categorias', (req, res) => {
  const categorias = consultar('SELECT * FROM fin_categorias ORDER BY tipo, nome');
  res.json(categorias);
});

const schemaCategoria = z.object({
  nome: z.string().min(1),
  tipo: z.enum(['receita', 'despesa']),
  pai_id: z.number().int().optional().nullable(),
});

router.post('/categorias', (req, res) => {
  const dados = schemaCategoria.parse(req.body);
  const info = executar(
    'INSERT INTO fin_categorias (nome, tipo, pai_id) VALUES (?, ?, ?)',
    dados.nome, dados.tipo, dados.pai_id || null
  );
  res.status(201).json({ id: info.lastInsertRowid });
});

// ==============================
// CENTROS DE CUSTO
// ==============================

router.get('/centros-custo', (req, res) => {
  const centros = consultar('SELECT * FROM fin_centros_custo ORDER BY nome');
  res.json(centros);
});

const schemaCentro = z.object({
  nome: z.string().min(1),
  codigo: z.string().optional(),
  responsavel_email: z.string().email().optional().nullable(),
});

router.post('/centros-custo', (req, res) => {
  const dados = schemaCentro.parse(req.body);
  const info = executar(
    'INSERT INTO fin_centros_custo (nome, codigo, responsavel_email) VALUES (?, ?, ?)',
    dados.nome, dados.codigo || null, dados.responsavel_email || null
  );
  res.status(201).json({ id: info.lastInsertRowid });
});

// ==============================
// LANÇAMENTOS
// ==============================

router.get('/lancamentos', (req, res) => {
  const { tipo, status, mes } = req.query;

  let sql = 'SELECT * FROM fin_lancamentos WHERE 1=1';
  const params = [];

  if (tipo && ['pagar', 'receber'].includes(tipo)) {
    sql += ' AND tipo = ?';
    params.push(tipo);
  }
  if (status && ['pendente', 'pago', 'cancelado'].includes(status)) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (mes) { // Formato YYYY-MM
    sql += ' AND data_vencimento LIKE ?';
    params.push(`${mes}-%`);
  }

  sql += ' ORDER BY data_vencimento ASC';

  const lancamentos = consultar(sql, ...params);
  res.json(lancamentos);
});

const schemaLancamento = z.object({
  tipo: z.enum(['pagar', 'receber']),
  descricao: z.string().min(1),
  valor_centavos: z.number().int().min(1),
  data_vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  conta_id: z.number().int().optional().nullable(),
  categoria_id: z.number().int().optional().nullable(),
  centro_custo_id: z.number().int().optional().nullable(),
  pessoa: z.string().optional(),
  observacao: z.string().optional()
});

router.post('/lancamentos', (req, res) => {
  const dados = schemaLancamento.parse(req.body);
  const info = executar(
    `INSERT INTO fin_lancamentos
      (tipo, descricao, valor_centavos, data_vencimento, conta_id, categoria_id, centro_custo_id, pessoa, observacao)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    dados.tipo, dados.descricao, dados.valor_centavos, dados.data_vencimento,
    dados.conta_id || null, dados.categoria_id || null, dados.centro_custo_id || null,
    dados.pessoa || null, dados.observacao || null
  );
  res.status(201).json({ id: info.lastInsertRowid });
});

// Pagar lançamento
router.post('/lancamentos/:id/pagar', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const dataHoje = new Date().toISOString().split('T')[0];

  const lanc = consultarUm('SELECT * FROM fin_lancamentos WHERE id = ?', id);
  if (!lanc) return res.status(404).json({ erro: 'Lançamento não encontrado' });
  if (lanc.status !== 'pendente') return res.status(400).json({ erro: 'Lançamento já processado' });

  executar(
    'UPDATE fin_lancamentos SET status = ?, valor_pago_centavos = ?, data_pagamento = ?, atualizado_em = ? WHERE id = ?',
    'pago', lanc.valor_centavos, dataHoje, agoraIso(), id
  );

  res.json({ sucesso: true });
});

module.exports = router;
