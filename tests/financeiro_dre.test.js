import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
const express = require('express');
const session = require('express-session');
const { executar } = require('../db');
const rotasRelatorios = require('../rotas/relatorios');
const rotasFinanceiro = require('../rotas/financeiro');

describe('Testes de Governança Financeira e Relatórios Anuais/Mensais', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: true,
    }));

    // Injeta sessão de usuário financeiro para os testes
    app.use((req, res, next) => {
      req.session.usuario = {
        email: 'financeiro@atlasgr.com.br',
        nome: 'Financeiro Teste',
        papeis: ['financeiro', 'admin'],
      };
      next();
    });

    app.use('/api/relatorios', rotasRelatorios);
    app.use('/api/financeiro', rotasFinanceiro);

    // Garante dados limpos/semeados para testes de DRE
    executar(`
      INSERT INTO fin_lancamentos (tipo, descricao, valor_centavos, data_vencimento, data_pagamento, status)
      VALUES ('receber', 'Faturamento Contrato GR', 1500000, '2026-03-10', '2026-03-10', 'pago')
    `);
    executar(`
      INSERT INTO fin_lancamentos (tipo, descricao, valor_centavos, data_vencimento, data_pagamento, status)
      VALUES ('pagar', 'Servidor e Telemetria', 300000, '2026-03-15', '2026-03-15', 'pago')
    `);
  });

  it('GET /api/relatorios/dre-anual deve retornar matriz de 12 meses e consolidados', async () => {
    const res = await request(app).get('/api/relatorios/dre-anual?ano=2026');
    expect(res.status).toBe(200);
    expect(res.body.ano).toBe(2026);
    expect(Array.isArray(res.body.meses)).toBe(true);
    expect(res.body.meses.length).toBe(12);

    // Valida estrutura contábil
    const mesMarco = res.body.meses[2]; // Março (índice 2)
    expect(mesMarco.mes).toBe('03');
    expect(mesMarco.nomeMes).toBe('Mar');
    expect(typeof mesMarco.receitaBruta).toBe('number');
    expect(typeof mesMarco.lucroLiquido).toBe('number');

    // Valida total anual em centavos
    expect(res.body.totalAnual.receitaBruta).toBeGreaterThanOrEqual(1500000);
    expect(typeof res.body.mediaMensal.receitaBruta).toBe('number');
  });

  it('GET /api/financeiro/fluxo-caixa deve suportar parâmetro ano e calcular saldo acumulado', async () => {
    const res = await request(app).get('/api/financeiro/fluxo-caixa?ano=2026');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(12);

    const primeiroMes = res.body[0];
    expect(primeiroMes).toHaveProperty('mes');
    expect(primeiroMes).toHaveProperty('receitas_previstas');
    expect(primeiroMes).toHaveProperty('receitas_realizadas');
    expect(primeiroMes).toHaveProperty('saldo_acumulado_realizado');
  });

  it('GET /api/relatorios/dre deve retornar DRE por período com estrutura completa', async () => {
    const res = await request(app).get('/api/relatorios/dre?de=2026-03-01&ate=2026-03-31');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('dre');
    expect(Array.isArray(res.body.dre)).toBe(true);
    expect(res.body.margens).toHaveProperty('margemBruta');
    expect(res.body.margens).toHaveProperty('margemEbitda');
    expect(res.body.margens).toHaveProperty('margemLiquida');
  });
});
