'use strict';

const express = require('express');
const { rota } = require('../lib/erros');
const { consultar } = require('../db');
const { exigirPapel } = require('../lib/seguranca');

const router = express.Router();

const permiteVisualizar = exigirPapel('financeiro', 'admin', 'diretoria');
router.use(permiteVisualizar);

const NOMES_MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function extrairFiltros(req) {
  const { centro_custo, de, ate, ano, empresa_id } = req.query;
  const usuario = req.session.usuario;
  return {
    centro_custo,
    de,
    ate,
    ano: ano ? parseInt(ano, 10) : new Date().getFullYear(),
    empresa_id: empresa_id || usuario?.empresa_id || null,
  };
}

// ------------------------------------------------------------------
// DRE Mensal / Período
// ------------------------------------------------------------------
router.get('/dre', rota(async (req, res) => {
  const filtros = extrairFiltros(req);

  // 1. Receitas de Cobranças Liquidadas
  let qReceitasCobrancas = `SELECT sum(valor_pago_centavos) as total FROM cobrancas WHERE valor_pago_centavos > 0 AND estagio NOT IN ('perda')`;
  const paramsCobrancas = [];
  if (filtros.de) {
    qReceitasCobrancas += ` AND pagamento >= ?`;
    paramsCobrancas.push(filtros.de);
  }
  if (filtros.ate) {
    qReceitasCobrancas += ` AND pagamento <= ?`;
    paramsCobrancas.push(filtros.ate);
  }
  if (filtros.empresa_id) {
    qReceitasCobrancas += ` AND empresa_id = ?`;
    paramsCobrancas.push(filtros.empresa_id);
  }
  const resCobrancas = consultar(qReceitasCobrancas, ...paramsCobrancas);
  const totalCobrancas = resCobrancas[0]?.total || 0;

  // 2. Receitas de Lançamentos Financeiros
  let qReceitasLanc = `SELECT sum(COALESCE(valor_pago_centavos, valor_centavos)) as total FROM fin_lancamentos WHERE tipo IN ('receber', 'receita') AND status = 'pago'`;
  const paramsLanc = [];
  if (filtros.de) {
    qReceitasLanc += ` AND COALESCE(data_pagamento, data_vencimento) >= ?`;
    paramsLanc.push(filtros.de);
  }
  if (filtros.ate) {
    qReceitasLanc += ` AND COALESCE(data_pagamento, data_vencimento) <= ?`;
    paramsLanc.push(filtros.ate);
  }
  const resLancReceitas = consultar(qReceitasLanc, ...paramsLanc);
  const totalLancReceitas = resLancReceitas[0]?.total || 0;

  const totalReceitaBruta = totalCobrancas + totalLancReceitas;

  // 3. Deduções e Impostos sobre Faturamento
  let qDeducoes = `
    SELECT sum(COALESCE(l.valor_pago_centavos, l.valor_centavos)) as total
    FROM fin_lancamentos l
    LEFT JOIN fin_categorias c ON l.categoria_id = c.id
    WHERE l.tipo IN ('pagar', 'despesa') AND l.status = 'pago'
      AND (c.nome LIKE '%imposto%' OR c.nome LIKE '%tribut%' OR c.nome LIKE '%dedu%' OR l.descricao LIKE '%imposto%' OR l.descricao LIKE '%tribut%')
  `;
  const paramsDeducoes = [];
  if (filtros.de) {
    qDeducoes += ` AND COALESCE(l.data_pagamento, l.data_vencimento) >= ?`;
    paramsDeducoes.push(filtros.de);
  }
  if (filtros.ate) {
    qDeducoes += ` AND COALESCE(l.data_pagamento, l.data_vencimento) <= ?`;
    paramsDeducoes.push(filtros.ate);
  }
  const resDeducoes = consultar(qDeducoes, ...paramsDeducoes);
  const totalDeducoes = resDeducoes[0]?.total || 0;

  const totalReceitaLiquida = Math.max(0, totalReceitaBruta - totalDeducoes);

  // 4. Custos dos Serviços Prestados (CSP)
  let qCustos = `
    SELECT sum(COALESCE(l.valor_pago_centavos, l.valor_centavos)) as total
    FROM fin_lancamentos l
    LEFT JOIN fin_categorias c ON l.categoria_id = c.id
    WHERE l.tipo IN ('pagar', 'despesa') AND l.status = 'pago'
      AND (c.nome LIKE '%custo%' OR c.nome LIKE '%telemetria%' OR c.nome LIKE '%chip%' OR c.nome LIKE '%rastreador%' OR l.descricao LIKE '%custo direto%')
  `;
  const paramsCustos = [];
  if (filtros.de) {
    qCustos += ` AND COALESCE(l.data_pagamento, l.data_vencimento) >= ?`;
    paramsCustos.push(filtros.de);
  }
  if (filtros.ate) {
    qCustos += ` AND COALESCE(l.data_pagamento, l.data_vencimento) <= ?`;
    paramsCustos.push(filtros.ate);
  }
  const resCustos = consultar(qCustos, ...paramsCustos);
  const totalCustos = resCustos[0]?.total || 0;

  const lucroBruto = totalReceitaLiquida - totalCustos;

  // 5. Despesas Operacionais (Reembolsos + Gerais)
  let qDespesasReembolso = `SELECT sum(total_aprovado_centavos) as total FROM relatorios WHERE estado IN ('pago', 'aprovado')`;
  const paramsDespesasReembolso = [];
  if (filtros.centro_custo) {
    qDespesasReembolso += ` AND centro_custo = ?`;
    paramsDespesasReembolso.push(filtros.centro_custo);
  }
  if (filtros.de) {
    qDespesasReembolso += ` AND (pago_em >= ? OR decidido_em >= ?)`;
    paramsDespesasReembolso.push(filtros.de, filtros.de);
  }
  if (filtros.ate) {
    qDespesasReembolso += ` AND (pago_em <= ? OR decidido_em <= ?)`;
    paramsDespesasReembolso.push(filtros.ate, filtros.ate);
  }
  const resDespesasReembolso = consultar(qDespesasReembolso, ...paramsDespesasReembolso);
  const totalReembolsos = resDespesasReembolso[0]?.total || 0;

  let qOutrasDespesas = `
    SELECT sum(COALESCE(l.valor_pago_centavos, l.valor_centavos)) as total
    FROM fin_lancamentos l
    LEFT JOIN fin_categorias c ON l.categoria_id = c.id
    WHERE l.tipo IN ('pagar', 'despesa') AND l.status = 'pago'
      AND (c.nome NOT LIKE '%imposto%' AND c.nome NOT LIKE '%tribut%' AND c.nome NOT LIKE '%dedu%' AND c.nome NOT LIKE '%custo%' AND c.nome NOT LIKE '%juros%' AND c.nome NOT LIKE '%tarifa%')
  `;
  const paramsOutrasDespesas = [];
  if (filtros.de) {
    qOutrasDespesas += ` AND COALESCE(l.data_pagamento, l.data_vencimento) >= ?`;
    paramsOutrasDespesas.push(filtros.de);
  }
  if (filtros.ate) {
    qOutrasDespesas += ` AND COALESCE(l.data_pagamento, l.data_vencimento) <= ?`;
    paramsOutrasDespesas.push(filtros.ate);
  }
  const resOutrasDespesas = consultar(qOutrasDespesas, ...paramsOutrasDespesas);
  const totalOutrasDespesas = resOutrasDespesas[0]?.total || 0;

  const totalDespesasOperacionais = totalReembolsos + totalOutrasDespesas;
  const ebitda = lucroBruto - totalDespesasOperacionais;

  // 6. Resultado Financeiro
  let qResultadoFin = `
    SELECT sum(COALESCE(l.valor_pago_centavos, l.valor_centavos)) as total
    FROM fin_lancamentos l
    LEFT JOIN fin_categorias c ON l.categoria_id = c.id
    WHERE l.tipo IN ('pagar', 'despesa') AND l.status = 'pago'
      AND (c.nome LIKE '%juros%' OR c.nome LIKE '%tarifa%' OR c.nome LIKE '%taxa%' OR l.descricao LIKE '%tarifa%' OR l.descricao LIKE '%juros%')
  `;
  const paramsResFin = [];
  if (filtros.de) {
    qResultadoFin += ` AND COALESCE(l.data_pagamento, l.data_vencimento) >= ?`;
    paramsResFin.push(filtros.de);
  }
  if (filtros.ate) {
    qResultadoFin += ` AND COALESCE(l.data_pagamento, l.data_vencimento) <= ?`;
    paramsResFin.push(filtros.ate);
  }
  const resFin = consultar(qResultadoFin, ...paramsResFin);
  const despesasFinanceiras = resFin[0]?.total || 0;
  const resultadoFinanceiro = -despesasFinanceiras;

  const lucroLiquido = ebitda + resultadoFinanceiro;

  const margemBruta = totalReceitaBruta > 0 ? Number(((lucroBruto / totalReceitaBruta) * 100).toFixed(2)) : 0;
  const margemEbitda = totalReceitaBruta > 0 ? Number(((ebitda / totalReceitaBruta) * 100).toFixed(2)) : 0;
  const margemLiquida = totalReceitaBruta > 0 ? Number(((lucroLiquido / totalReceitaBruta) * 100).toFixed(2)) : 0;

  const dre = [
    { codigo: '1', descricao: '(+) Receita Bruta de Vendas/Serviços', valorCentavos: totalReceitaBruta, tipo: 'totalizador' },
    { codigo: '2', descricao: '(-) Deduções da Receita Bruta e Tributos', valorCentavos: totalDeducoes, tipo: 'deducao' },
    { codigo: '3', descricao: '(=) Receita Operacional Líquida', valorCentavos: totalReceitaLiquida, tipo: 'subtotal' },
    { codigo: '4', descricao: '(-) Custos dos Serviços Prestados (CSP)', valorCentavos: totalCustos, tipo: 'deducao' },
    { codigo: '5', descricao: '(=) Lucro Bruto', valorCentavos: lucroBruto, margemPercentual: margemBruta, tipo: 'destaque' },
    { codigo: '6', descricao: '(-) Despesas Operacionais e Administrativas', valorCentavos: totalDespesasOperacionais, tipo: 'deducao' },
    { codigo: '7', descricao: '(=) EBITDA / Resultado Operacional', valorCentavos: ebitda, margemPercentual: margemEbitda, tipo: 'destaque' },
    { codigo: '8', descricao: '(+/-) Resultado Financeiro Líquido', valorCentavos: resultadoFinanceiro, tipo: 'neutro' },
    { codigo: '9', descricao: '(=) Lucro Líquido do Exercício', valorCentavos: lucroLiquido, margemPercentual: margemLiquida, tipo: 'resultado_final' }
  ];

  res.json({
    periodo: { de: filtros.de, ate: filtros.ate, ano: filtros.ano },
    margens: { margemBruta, margemEbitda, margemLiquida },
    dre
  });
}));

// ------------------------------------------------------------------
// DRE Anual (Consolidado 12 Meses: Jan a Dez + Total + Média)
// ------------------------------------------------------------------
router.get('/dre-anual', rota(async (req, res) => {
  const filtros = extrairFiltros(req);
  const ano = filtros.ano;

  const meses = [];
  const acumulado = {
    receitaBruta: 0,
    deducoes: 0,
    receitaLiquida: 0,
    custosServicos: 0,
    lucroBruto: 0,
    despesasOperacionais: 0,
    ebitda: 0,
    resultadoFinanceiro: 0,
    lucroLiquido: 0
  };

  for (let m = 1; m <= 12; m++) {
    const mesFormatado = String(m).padStart(2, '0');
    const chaveMes = `${ano}-${mesFormatado}`;

    // Receitas de Cobranças
    let qCobrancas = `SELECT sum(valor_pago_centavos) as total FROM cobrancas WHERE valor_pago_centavos > 0 AND estagio NOT IN ('perda') AND pagamento LIKE ?`;
    const pCobrancas = [`${chaveMes}%`];
    if (filtros.empresa_id) {
      qCobrancas += ` AND empresa_id = ?`;
      pCobrancas.push(filtros.empresa_id);
    }
    const totalCobrancas = consultar(qCobrancas, ...pCobrancas)[0]?.total || 0;

    // Receitas de Lançamentos
    const qLancReceitas = `SELECT sum(COALESCE(NULLIF(valor_pago_centavos, 0), valor_centavos)) as total FROM fin_lancamentos WHERE tipo IN ('receber', 'receita') AND status = 'pago' AND (data_pagamento LIKE ? OR (data_pagamento IS NULL AND data_vencimento LIKE ?))`;
    const totalLancReceitas = consultar(qLancReceitas, `${chaveMes}%`, `${chaveMes}%`)[0]?.total || 0;
    const receitaBruta = totalCobrancas + totalLancReceitas;

    // Deduções
    const qDeducoes = `
      SELECT sum(COALESCE(NULLIF(l.valor_pago_centavos, 0), l.valor_centavos)) as total
      FROM fin_lancamentos l
      LEFT JOIN fin_categorias c ON l.categoria_id = c.id
      WHERE l.tipo IN ('pagar', 'despesa') AND l.status = 'pago'
        AND (c.nome LIKE '%imposto%' OR c.nome LIKE '%tribut%' OR c.nome LIKE '%dedu%' OR l.descricao LIKE '%imposto%')
        AND (l.data_pagamento LIKE ? OR (l.data_pagamento IS NULL AND l.data_vencimento LIKE ?))
    `;
    const deducoes = consultar(qDeducoes, `${chaveMes}%`, `${chaveMes}%`)[0]?.total || 0;
    const receitaLiquida = Math.max(0, receitaBruta - deducoes);

    // Custos
    const qCustos = `
      SELECT sum(COALESCE(NULLIF(l.valor_pago_centavos, 0), l.valor_centavos)) as total
      FROM fin_lancamentos l
      LEFT JOIN fin_categorias c ON l.categoria_id = c.id
      WHERE l.tipo IN ('pagar', 'despesa') AND l.status = 'pago'
        AND (c.nome LIKE '%custo%' OR c.nome LIKE '%telemetria%' OR c.nome LIKE '%chip%' OR c.nome LIKE '%rastreador%')
        AND (l.data_pagamento LIKE ? OR (l.data_pagamento IS NULL AND l.data_vencimento LIKE ?))
    `;
    const custosServicos = consultar(qCustos, `${chaveMes}%`, `${chaveMes}%`)[0]?.total || 0;
    const lucroBruto = receitaLiquida - custosServicos;

    // Despesas Operacionais (Reembolsos + Gerais)
    let qReembolsos = `SELECT sum(total_aprovado_centavos) as total FROM relatorios WHERE estado IN ('pago', 'aprovado') AND (pago_em LIKE ? OR decidido_em LIKE ?)`;
    const pReembolsos = [`${chaveMes}%`, `${chaveMes}%`];
    if (filtros.centro_custo) {
      qReembolsos += ` AND centro_custo = ?`;
      pReembolsos.push(filtros.centro_custo);
    }
    const reembolsos = consultar(qReembolsos, ...pReembolsos)[0]?.total || 0;

    const qGerais = `
      SELECT sum(COALESCE(NULLIF(l.valor_pago_centavos, 0), l.valor_centavos)) as total
      FROM fin_lancamentos l
      LEFT JOIN fin_categorias c ON l.categoria_id = c.id
      WHERE l.tipo IN ('pagar', 'despesa') AND l.status = 'pago'
        AND (c.nome NOT LIKE '%imposto%' AND c.nome NOT LIKE '%tribut%' AND c.nome NOT LIKE '%dedu%' AND c.nome NOT LIKE '%custo%' AND c.nome NOT LIKE '%juros%' AND c.nome NOT LIKE '%tarifa%')
        AND (l.data_pagamento LIKE ? OR (l.data_pagamento IS NULL AND l.data_vencimento LIKE ?))
    `;
    const outrasDespesas = consultar(qGerais, `${chaveMes}%`, `${chaveMes}%`)[0]?.total || 0;
    const despesasOperacionais = reembolsos + outrasDespesas;
    const ebitda = lucroBruto - despesasOperacionais;

    // Resultado Financeiro
    const qFin = `
      SELECT sum(COALESCE(NULLIF(l.valor_pago_centavos, 0), l.valor_centavos)) as total
      FROM fin_lancamentos l
      LEFT JOIN fin_categorias c ON l.categoria_id = c.id
      WHERE l.tipo IN ('pagar', 'despesa') AND l.status = 'pago'
        AND (c.nome LIKE '%juros%' OR c.nome LIKE '%tarifa%' OR c.nome LIKE '%taxa%')
        AND (l.data_pagamento LIKE ? OR (l.data_pagamento IS NULL AND l.data_vencimento LIKE ?))
    `;
    const despesasFin = consultar(qFin, `${chaveMes}%`, `${chaveMes}%`)[0]?.total || 0;
    const resultadoFinanceiro = -despesasFin;
    const lucroLiquido = ebitda + resultadoFinanceiro;

    const margemBruta = receitaBruta > 0 ? Number(((lucroBruto / receitaBruta) * 100).toFixed(2)) : 0;
    const margemEbitda = receitaBruta > 0 ? Number(((ebitda / receitaBruta) * 100).toFixed(2)) : 0;
    const margemLiquida = receitaBruta > 0 ? Number(((lucroLiquido / receitaBruta) * 100).toFixed(2)) : 0;

    meses.push({
      mes: mesFormatado,
      nomeMes: NOMES_MESES[m - 1],
      chaveMes,
      receitaBruta,
      deducoes,
      receitaLiquida,
      custosServicos,
      lucroBruto,
      despesasOperacionais,
      ebitda,
      resultadoFinanceiro,
      lucroLiquido,
      margemBruta,
      margemEbitda,
      margemLiquida
    });

    acumulado.receitaBruta += receitaBruta;
    acumulado.deducoes += deducoes;
    acumulado.receitaLiquida += receitaLiquida;
    acumulado.custosServicos += custosServicos;
    acumulado.lucroBruto += lucroBruto;
    acumulado.despesasOperacionais += despesasOperacionais;
    acumulado.ebitda += ebitda;
    acumulado.resultadoFinanceiro += resultadoFinanceiro;
    acumulado.lucroLiquido += lucroLiquido;
  }

  const margemBrutaAnual = acumulado.receitaBruta > 0 ? Number(((acumulado.lucroBruto / acumulado.receitaBruta) * 100).toFixed(2)) : 0;
  const margemEbitdaAnual = acumulado.receitaBruta > 0 ? Number(((acumulado.ebitda / acumulado.receitaBruta) * 100).toFixed(2)) : 0;
  const margemLiquidaAnual = acumulado.receitaBruta > 0 ? Number(((acumulado.lucroLiquido / acumulado.receitaBruta) * 100).toFixed(2)) : 0;

  const mediaMensal = {
    receitaBruta: Math.round(acumulado.receitaBruta / 12),
    deducoes: Math.round(acumulado.deducoes / 12),
    receitaLiquida: Math.round(acumulado.receitaLiquida / 12),
    custosServicos: Math.round(acumulado.custosServicos / 12),
    lucroBruto: Math.round(acumulado.lucroBruto / 12),
    despesasOperacionais: Math.round(acumulado.despesasOperacionais / 12),
    ebitda: Math.round(acumulado.ebitda / 12),
    resultadoFinanceiro: Math.round(acumulado.resultadoFinanceiro / 12),
    lucroLiquido: Math.round(acumulado.lucroLiquido / 12),
    margemBruta: margemBrutaAnual,
    margemEbitda: margemEbitdaAnual,
    margemLiquida: margemLiquidaAnual
  };

  res.json({
    ano,
    meses,
    totalAnual: {
      ...acumulado,
      margemBruta: margemBrutaAnual,
      margemEbitda: margemEbitdaAnual,
      margemLiquida: margemLiquidaAnual
    },
    mediaMensal
  });
}));

router.get('/fluxo', rota(async (req, res) => {
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
