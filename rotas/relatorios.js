'use strict';

const express = require('express');
const { rota } = require('../lib/erros');
const { consultar } = require('../db');
const { exigirPapel } = require('../lib/seguranca');

const router = express.Router();

const permiteVisualizar = exigirPapel('financeiro', 'admin', 'diretoria');

router.use(permiteVisualizar);

function extrairFiltros(req) {
  const { centro_custo, de, ate } = req.query;
  const usuario = req.session.usuario;
  // Apenas extrai filtros de data, preparação para filtros de tenant (empresa_id)
  return {
    centro_custo,
    de,
    ate,
    empresa_id: usuario.empresa_id || null // Placeholder para quando 'empresa_id' for injetado na sessão pela Onda 1
  };
}

router.get('/dre', rota(async (req, res) => {
  const filtros = extrairFiltros(req);

  // Receitas (Contas recebidas/pagas, descartando perdas e canceladas (embora o status não exista explicitamente na origem simulada, usamos valor_pago > 0))
  let qReceitas = `SELECT sum(valor_pago_centavos) as total FROM cobrancas WHERE valor_pago_centavos > 0 AND estagio NOT IN ('perda')`;
  const paramsReceitas = [];

  if (filtros.de) {
    qReceitas += ` AND pagamento >= ?`;
    paramsReceitas.push(filtros.de);
  }
  if (filtros.ate) {
    qReceitas += ` AND pagamento <= ?`;
    paramsReceitas.push(filtros.ate);
  }

  const receitas = consultar(qReceitas, ...paramsReceitas);
  const totalReceitas = receitas[0].total || 0;

  // Despesas (Reembolsos pagos e outras despesas aprovadas)
  let qDespesas = `SELECT sum(total_aprovado_centavos) as total FROM relatorios WHERE estado IN ('pago', 'aprovado')`;
  const paramsDespesas = [];

  if (filtros.centro_custo) {
    qDespesas += ` AND centro_custo = ?`;
    paramsDespesas.push(filtros.centro_custo);
  }
  if (filtros.de) {
    qDespesas += ` AND (pago_em >= ? OR decidido_em >= ?)`;
    paramsDespesas.push(filtros.de, filtros.de);
  }
  if (filtros.ate) {
    qDespesas += ` AND (pago_em <= ? OR decidido_em <= ?)`;
    paramsDespesas.push(filtros.ate, filtros.ate);
  }

  const despesasReembolso = consultar(qDespesas, ...paramsDespesas);
  const totalDespesas = despesasReembolso[0].total || 0;

  const dre = [
    { descricao: 'Receita Bruta', valorCentavos: totalReceitas },
    { descricao: '(-) Deduções e Impostos', valorCentavos: 0 },
    { descricao: 'Receita Líquida', valorCentavos: totalReceitas },
    { descricao: '(-) Custos dos Serviços', valorCentavos: 0 },
    { descricao: 'Lucro Bruto', valorCentavos: totalReceitas },
    { descricao: '(-) Despesas Operacionais', valorCentavos: totalDespesas },
    { descricao: 'Lucro Líquido', valorCentavos: totalReceitas - totalDespesas }
  ];

  res.json({ dre });
}));

router.get('/fluxo', rota(async (req, res) => {
  // Um relatório simples de fluxo de caixa
  res.json({ fluxo: [] });
}));

router.get('/financeiros', rota(async (req, res) => {
  res.json({ financeiros: [] });
}));

router.get('/vendas', rota(async (req, res) => {
  res.json({ vendas: [], aviso: 'Módulo de vendas ainda não implementado. Dados simulados ou vazios.' });
}));

router.get('/compras', rota(async (req, res) => {
  res.json({ compras: [], aviso: 'Módulo de compras ainda não implementado. Dados simulados ou vazios.' });
}));

router.get('/estoque', rota(async (req, res) => {
  res.json({ estoque: [], aviso: 'Módulo de estoque ainda não implementado. Dados simulados ou vazios.' });
}));

router.get('/construtor', rota(async (req, res) => {
  res.json({ construtor: [] });
}));

module.exports = router;
