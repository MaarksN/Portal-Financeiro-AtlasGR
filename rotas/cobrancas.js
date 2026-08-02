'use strict';

const express = require('express');
const { z } = require('zod');

const cobrancas = require('../lib/cobrancas');
const funil = require('../lib/funil');
const conectores = require('../lib/conectores');
const { rota } = require('../lib/erros');
const { exigirPapel } = require('../lib/seguranca');
const { validarCorpo, filtrosDaQuery, booleanoDaQuery } = require('./comum');

const router = express.Router();

// Ver a carteira é do financeiro (admin entra por cima, em temPapel).
const soFinanceiro = exigirPapel('financeiro');

const CHAVES_FILTRO = [
  'busca', 'estagio', 'responsavel', 'cliente', 'origem', 'faixa', 'vencimentoDe', 'vencimentoAte',
];

function filtrosDaRequisicao(req) {
  return {
    ...filtrosDaQuery(req.query, CHAVES_FILTRO),
    apenasAbertas: booleanoDaQuery(req.query.apenasAbertas),
    apenasAtrasadas: booleanoDaQuery(req.query.apenasAtrasadas),
  };
}

router.use(soFinanceiro);

router.get('/estagios', (req, res) => res.json({ estagios: funil.ESTAGIOS, faixas: funil.FAIXAS }));

// Tudo que o painel precisa numa chamada só — evita quatro requisições
// em sequência a cada troca de filtro.
router.get('/painel', rota(async (req, res) => {
  const filtros = filtrosDaRequisicao(req);
  res.json({
    indicadores: cobrancas.indicadores(filtros),
    aging: cobrancas.aging(filtros),
    funil: cobrancas.quadro(filtros),
    clientes: cobrancas.porCliente(filtros).slice(0, 12),
    agenda: cobrancas.agenda(req.session.usuario, { apenasMinhas: booleanoDaQuery(req.query.apenasMinhas) }),
    fontes: conectores.situacao(),
  });
}));

router.get('/', rota(async (req, res) => res.json(cobrancas.listar(filtrosDaRequisicao(req)))));

router.get('/clientes', rota(async (req, res) => res.json(cobrancas.porCliente(filtrosDaRequisicao(req)))));

router.get('/exportar', rota(async (req, res) => {
  const csv = cobrancas.exportarCsv(filtrosDaRequisicao(req));
  const hoje = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="cobrancas-atlas-${hoje}.csv"`);
  res.send(csv);
}));

router.get('/:id', rota(async (req, res) => res.json(cobrancas.obter(Number(req.params.id)))));

const esquemaMover = z.object({
  para: z.string().trim().min(1, 'Informe o estágio de destino.'),
  justificativa: z.string().trim().max(1000).optional().nullable(),
  promessaEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.').optional().nullable(),
  proximaAcao: z.string().trim().max(300).optional().nullable(),
  proximaAcaoEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.').optional().nullable(),
});

router.post('/:id/mover', validarCorpo(esquemaMover), rota(async (req, res) => {
  res.json(cobrancas.mover(Number(req.params.id), req.session.usuario, req.dados));
}));

const esquemaInteracao = z.object({
  tipo: z.enum(['ligacao', 'email', 'whatsapp', 'reuniao', 'nota']),
  resumo: z.string().trim().min(3, 'Descreva o que foi tratado.').max(2000),
  proximaAcao: z.string().trim().max(300).optional().nullable(),
  proximaAcaoEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.').optional().nullable(),
});

router.post('/:id/interacoes', validarCorpo(esquemaInteracao), rota(async (req, res) => {
  res.status(201).json(cobrancas.registrarInteracao(Number(req.params.id), req.session.usuario, req.dados));
}));

const esquemaAtribuir = z.object({
  responsavel: z.string().trim().email('Informe um e-mail válido.').or(z.literal('')).nullable().optional(),
});

router.post('/:id/responsavel', validarCorpo(esquemaAtribuir), rota(async (req, res) => {
  res.json(cobrancas.atribuir(Number(req.params.id), req.session.usuario, req.dados.responsavel || null));
}));

module.exports = router;
