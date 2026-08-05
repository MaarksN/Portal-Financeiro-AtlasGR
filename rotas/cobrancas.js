'use strict';

const express = require('express');
const multer = require('multer');
const { z } = require('zod');

const cobrancas = require('../lib/cobrancas');
const funil = require('../lib/funil');
const conectores = require('../lib/conectores');
const boleto = require('../lib/conectores/boleto');
const emissaoBoleto = require('../lib/emissaoBoleto');
const { consultarUm, executar, emTransacao } = require('../db');
const { paraCentavos } = require('../lib/dinheiro');
const { montarCobranca } = require('../lib/conectores/comum');
const { rota, ErroApp } = require('../lib/erros');
const { exigirPapel } = require('../lib/seguranca');
const { validarCorpo, filtrosDaQuery, booleanoDaQuery } = require('./comum');

const router = express.Router();

const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 2 },
  fileFilter: (req, arquivo, callback) => {
    if (arquivo.mimetype !== 'application/pdf' && !/\.pdf$/i.test(arquivo.originalname)) {
      return callback(new ErroApp('Envie um arquivo .pdf.', { codigo: 'arquivo_invalido' }));
    }
    return callback(null, true);
  },
});

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

// ------------------------- Importar boleto/informativo -------------------------
// Upload de PDF (boleto obrigatório, informativo com detalhamento por
// veículo opcional) devolve um PREVIEW — nada é gravado aqui. Preview
// vira cobrança só depois de confirmado, editável, na tela seguinte.
router.post(
  '/importar-boleto',
  uploadPdf.fields([{ name: 'boleto', maxCount: 1 }, { name: 'informativo', maxCount: 1 }]),
  rota(async (req, res) => {
    const arquivoBoleto = req.files?.boleto?.[0];
    if (!arquivoBoleto) throw new ErroApp('Envie o PDF do boleto.', { codigo: 'arquivo_invalido' });

    const dadosBoleto = await boleto.analisarBoleto(arquivoBoleto.buffer);

    let informativo = null;
    const arquivoInformativo = req.files?.informativo?.[0];
    if (arquivoInformativo) {
      informativo = await boleto.analisarInformativo(arquivoInformativo.buffer);
    }

    res.json({ boleto: dadosBoleto, informativo });
  }),
);

const esquemaItemBoleto = z.object({
  placa: z.string().trim().min(1),
  transportador: z.string().trim().optional().nullable(),
  mesReferencia: z.string().trim().optional().nullable(),
  valor: z.union([z.string(), z.number()]),
});

const esquemaConfirmarBoleto = z.object({
  idExterno: z.string().trim().min(1, 'Falta um identificador para este boleto (nosso número ou documento).'),
  documento: z.string().trim().max(100).optional().nullable(),
  clienteNome: z.string().trim().min(1, 'Informe o nome do cliente.'),
  clienteDoc: z.string().trim().max(30).optional().nullable(),
  valor: z.union([z.string(), z.number()]),
  emissao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe o vencimento.'),
  observacao: z.string().trim().max(1000).optional().nullable(),
  itens: z.array(esquemaItemBoleto).optional().default([]),
});

router.post('/importar-boleto/confirmar', validarCorpo(esquemaConfirmarBoleto), rota(async (req, res) => {
  const dados = req.dados;

  const cobranca = montarCobranca('boleto', {
    idExterno: dados.idExterno,
    documento: dados.documento,
    clienteNome: dados.clienteNome,
    clienteDoc: dados.clienteDoc,
    valor: dados.valor,
    emissao: dados.emissao,
    vencimento: dados.vencimento,
    statusOrigem: dados.observacao || null,
  });
  if (!cobranca) throw new ErroApp('Dados insuficientes para gravar a cobrança.', { codigo: 'entrada_invalida' });

  const aplicar = emTransacao(() => {
    conectores.gravar(cobranca);
    const linha = consultarUm(
      'SELECT id FROM cobrancas WHERE origem = ? AND id_externo = ?', 'boleto', dados.idExterno,
    );

    // Reimportar o mesmo boleto substitui o detalhamento em vez de duplicar.
    executar('DELETE FROM cobranca_itens WHERE cobranca_id = ?', linha.id);
    for (const item of dados.itens) {
      executar(
        `INSERT INTO cobranca_itens (cobranca_id, placa, transportador, mes_referencia, valor_centavos)
         VALUES (?, ?, ?, ?, ?)`,
        linha.id, item.placa, item.transportador || null, item.mesReferencia || null, paraCentavos(item.valor),
      );
    }
    return linha.id;
  });

  const cobrancaId = aplicar();
  res.status(201).json(cobrancas.obter(cobrancaId));
}));

router.get('/:id', rota(async (req, res) => res.json(cobrancas.obter(Number(req.params.id)))));

// Estrutura pronta, desligada até existir convênio Sicredi — ver
// lib/emissaoBoleto.js. Recusa com 503 e mensagem clara em vez de
// fingir que emitiu.
router.post('/:id/emitir-boleto', rota(async (req, res) => {
  res.status(201).json(await emissaoBoleto.emitir(cobrancas.obter(Number(req.params.id))));
}));

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
