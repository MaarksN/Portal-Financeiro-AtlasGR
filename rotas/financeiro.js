'use strict';

const express = require('express');
const { z } = require('zod');
const { consultar, consultarUm, executar, agoraIso } = require('../db');
const { exigirPapel } = require('../lib/seguranca');

const router = express.Router();

// Apenas usuários com permissão financeira devem acessar este módulo.
router.use(exigirPapel('financeiro'));

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
  instituicao: z.string().optional().nullable(),
  agencia: z.string().optional().nullable(),
  numero: z.string().optional().nullable(),
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
  codigo: z.string().optional().nullable(),
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
  pessoa: z.string().optional().nullable(),
  observacao: z.string().optional().nullable(),
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

// ==============================
// NOVAS ROTAS
// ==============================

router.get('/extrato-pj', (req, res) => {
  const { conta_id, de, ate } = req.query;
  
  let sqlConta = "SELECT * FROM fin_contas WHERE tipo = 'corrente'";
  const paramsConta = [];
  if (conta_id) {
    sqlConta += ' AND id = ?';
    paramsConta.push(conta_id);
  }
  const conta = consultarUm(sqlConta, ...paramsConta);
  
  if (!conta) return res.status(404).json({ erro: 'Conta PJ não encontrada' });

  let sql = 'SELECT * FROM fin_lancamentos WHERE conta_id = ?';
  const params = [conta.id];
  
  if (de) {
    sql += ' AND COALESCE(data_pagamento, data_vencimento) >= ?';
    params.push(de);
  }
  if (ate) {
    sql += ' AND COALESCE(data_pagamento, data_vencimento) <= ?';
    params.push(ate);
  }
  
  sql += ' ORDER BY COALESCE(data_pagamento, data_vencimento) ASC, id ASC';
  
  const lancamentos = consultar(sql, ...params);
  let saldo = conta.saldo_inicial_centavos;
  const extrato = lancamentos.map(l => {
    const valor = l.valor_pago_centavos || l.valor_centavos;
    if (l.tipo === 'receita' || l.tipo === 'receber') saldo += valor;
    else saldo -= valor;
    return { ...l, saldo_apos_lancamento: saldo };
  });

  res.json({ conta, saldo_atual: saldo, lancamentos: extrato });
});

router.get('/outras-contas', (req, res) => {
  const contas = consultar("SELECT * FROM fin_contas WHERE tipo != 'corrente' ORDER BY nome");
  res.json(contas);
});

router.get('/competencia', (req, res) => {
  const { mes } = req.query;
  if (!mes) return res.status(400).json({ erro: 'Mês é obrigatório (YYYY-MM)' });

  const todos = consultar('SELECT * FROM fin_lancamentos');
  const lancamentos = todos.filter(l => {
    const comp = l.competencia || l.data_vencimento.substring(0, 7);
    return comp === mes;
  }).sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));

  let receitas = 0;
  let despesas = 0;
  lancamentos.forEach(l => {
    if (l.tipo === 'receber') receitas += l.valor_centavos;
    if (l.tipo === 'pagar') despesas += l.valor_centavos;
  });

  res.json({
    mes,
    receitas_centavos: receitas,
    despesas_centavos: despesas,
    resultado_centavos: receitas - despesas,
    lancamentos
  });
});

router.get('/contas-pagar', (req, res) => {
  const { status, mes, pessoa } = req.query;
  let sql = "SELECT * FROM fin_lancamentos WHERE tipo = 'pagar'";
  const params = [];
  
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (mes) { sql += ' AND data_vencimento LIKE ?'; params.push(`${mes}-%`); }
  if (pessoa) { sql += ' AND pessoa LIKE ?'; params.push(`%${pessoa}%`); }
  
  sql += ' ORDER BY data_vencimento ASC';
  const lancamentos = consultar(sql, ...params);
  
  let total_pendente = 0;
  let total_pago = 0;
  lancamentos.forEach(l => {
    if (l.status === 'pendente') total_pendente += l.valor_centavos;
    if (l.status === 'pago') total_pago += (l.valor_pago_centavos || l.valor_centavos);
  });
  
  res.json({
    quantidade: lancamentos.length,
    total_pendente,
    total_pago,
    lancamentos
  });
});

router.get('/dda', (req, res) => {
  const lancamentos = consultar("SELECT * FROM fin_lancamentos WHERE tipo = 'pagar' AND status = 'pendente' ORDER BY data_vencimento ASC");
  res.json(lancamentos);
});

router.get('/contas-receber', (req, res) => {
  const { status, mes, pessoa } = req.query;
  let sql = "SELECT * FROM fin_lancamentos WHERE tipo = 'receber'";
  const params = [];
  
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (mes) { sql += ' AND data_vencimento LIKE ?'; params.push(`${mes}-%`); }
  if (pessoa) { sql += ' AND pessoa LIKE ?'; params.push(`%${pessoa}%`); }
  
  sql += ' ORDER BY data_vencimento ASC';
  const lancamentos = consultar(sql, ...params);
  
  let total_pendente = 0;
  let total_pago = 0;
  lancamentos.forEach(l => {
    if (l.status === 'pendente') total_pendente += l.valor_centavos;
    if (l.status === 'pago') total_pago += (l.valor_pago_centavos || l.valor_centavos);
  });
  
  res.json({
    quantidade: lancamentos.length,
    total_pendente,
    total_pago,
    lancamentos
  });
});

router.get('/inadimplentes', (req, res) => {
  const hoje = new Date().toISOString().split('T')[0];
  const sql = "SELECT * FROM fin_lancamentos WHERE tipo = 'receber' AND status = 'pendente' AND data_vencimento < ? ORDER BY pessoa, data_vencimento ASC";
  const lancamentos = consultar(sql, hoje);
  
  const map = new Map();
  let total_centavos_geral = 0;
  
  lancamentos.forEach(l => {
    const nome = l.pessoa || 'Desconhecido';
    if (!map.has(nome)) {
      map.set(nome, { pessoa: nome, total_centavos: 0, quantidade: 0, lancamentos: [] });
    }
    const group = map.get(nome);
    group.lancamentos.push(l);
    group.total_centavos += l.valor_centavos;
    group.quantidade += 1;
    total_centavos_geral += l.valor_centavos;
  });
  
  const inadimplentes = Array.from(map.values());
  res.json({
    inadimplentes,
    total_centavos: total_centavos_geral,
    total_pessoas: inadimplentes.length
  });
});

router.get('/extrato-movimentacoes', (req, res) => {
  const { de, ate, tipo, conta_id } = req.query;
  let sql = `
    SELECT l.*, c.nome as conta_nome, cat.nome as categoria_nome 
    FROM fin_lancamentos l
    LEFT JOIN fin_contas c ON l.conta_id = c.id
    LEFT JOIN fin_categorias cat ON l.categoria_id = cat.id
    WHERE 1=1
  `;
  const params = [];
  
  if (de) { sql += ' AND l.data_vencimento >= ?'; params.push(de); }
  if (ate) { sql += ' AND l.data_vencimento <= ?'; params.push(ate); }
  if (tipo) { sql += ' AND l.tipo = ?'; params.push(tipo); }
  if (conta_id) { sql += ' AND l.conta_id = ?'; params.push(conta_id); }
  
  sql += ' ORDER BY l.data_vencimento DESC, l.id DESC';
  const lancamentos = consultar(sql, ...params);
  
  res.json(lancamentos);
});

router.get('/fluxo-caixa', (req, res) => {
  const mesesQtd = parseInt(req.query.meses || '3', 10);
  
  const d = new Date();
  const arr = [];
  
  for (let i = 0; i < mesesQtd; i++) {
    const ano = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    arr.push(`${ano}-${m}`);
    d.setMonth(d.getMonth() + 1);
  }
  
  const sql = "SELECT * FROM fin_lancamentos WHERE data_vencimento LIKE ? OR data_pagamento LIKE ?";
  
  const fluxo = arr.map(mes => {
    const params = [`${mes}-%`, `${mes}-%`];
    const lancamentos = consultar(sql, ...params);
    
    let rec_prev = 0, desp_prev = 0, rec_real = 0, desp_real = 0;
    
    lancamentos.forEach(l => {
      const isMesVenc = l.data_vencimento && l.data_vencimento.startsWith(mes);
      const isMesPag = l.data_pagamento && l.data_pagamento.startsWith(mes);
      
      if (l.tipo === 'receber') {
        if (l.status === 'pendente' && isMesVenc) rec_prev += l.valor_centavos;
        if (l.status === 'pago' && isMesPag) rec_real += (l.valor_pago_centavos || l.valor_centavos);
      } else if (l.tipo === 'pagar') {
        if (l.status === 'pendente' && isMesVenc) desp_prev += l.valor_centavos;
        if (l.status === 'pago' && isMesPag) desp_real += (l.valor_pago_centavos || l.valor_centavos);
      }
    });
    
    return {
      mes,
      receitas_previstas: rec_prev,
      despesas_previstas: desp_prev,
      receitas_realizadas: rec_real,
      despesas_realizadas: desp_real,
      saldo_previsto: rec_prev - desp_prev,
      saldo_realizado: rec_real - desp_real
    };
  });
  
  res.json(fluxo);
});

router.get('/historico', (req, res) => {
  const pagina = parseInt(req.query.pagina || '1', 10);
  const limite = parseInt(req.query.limite || '50', 10);
  const offset = (pagina - 1) * limite;
  
  const sql = `
    SELECT l.*, c.nome as conta_nome, cat.nome as categoria_nome, cc.nome as centro_custo_nome
    FROM fin_lancamentos l
    LEFT JOIN fin_contas c ON l.conta_id = c.id
    LEFT JOIN fin_categorias cat ON l.categoria_id = cat.id
    LEFT JOIN fin_centros_custo cc ON l.centro_custo_id = cc.id
    WHERE l.status != 'pendente'
    ORDER BY COALESCE(l.atualizado_em, l.data_vencimento) DESC, l.id DESC
    LIMIT ? OFFSET ?
  `;
  const lancamentos = consultar(sql, limite, offset);
  
  res.json(lancamentos);
});

module.exports = router;
