'use strict';

const express = require('express');
const { z } = require('zod');

const config = require('../config');
const reembolsos = require('../lib/reembolsos');
const politica = require('../lib/politica');
const anexos = require('../lib/anexos');
const { rota, semPermissao } = require('../lib/erros');
const { exigirPapel } = require('../lib/seguranca');
const { validarCorpo, booleanoDaQuery } = require('./comum');

const router = express.Router();

// ------------------------------- Consulta -------------------------------
router.get('/opcoes', (req, res) => {
  res.json({
    categorias: politica.categorias(),
    alcadas: config.politica.alcadas.map((a) => ({ ...a, ateReais: a.ate === null ? null : a.ate / 100 })),
    prazoLancamentoDias: config.politica.prazoLancamentoDias,
    tamanhoMaximoMb: Math.round(config.anexos.tamanhoMaximo / 1024 / 1024),
  });
});

router.get('/resumo', (req, res) => res.json(reembolsos.resumoDe(req.session.usuario)));

// Fila de quem aprova — só aparece o que está esperando a alçada dele.
router.get('/fila', exigirPapel('coordenacao', 'gerencia', 'diretoria'), (req, res) => {
  res.json(reembolsos.filaDeAprovacao(req.session.usuario));
});

router.get('/', (req, res) => {
  res.json(reembolsos.listar({
    usuario: req.session.usuario,
    estado: req.query.estado || null,
    todos: booleanoDaQuery(req.query.todos),
  }));
});

// -------------------------------- Anexos --------------------------------
// Antes de `/:id` porque `/anexos/:anexoId` também tem duas partes.
router.get('/anexos/:anexoId', rota(async (req, res) => {
  const { linha, caminho } = anexos.caminhoDe(Number(req.params.anexoId));
  if (!reembolsos.podeBaixarAnexo(linha, req.session.usuario)) {
    throw semPermissao('Você não tem acesso a este comprovante.');
  }
  res.setHeader('Content-Type', linha.tipo);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(linha.nome_original)}"`);
  res.sendFile(caminho);
}));

router.delete('/anexos/:anexoId', rota(async (req, res) => {
  res.json(reembolsos.removerComprovante(Number(req.params.anexoId), req.session.usuario));
}));

router.post(
  '/despesas/:despesaId/anexos',
  anexos.upload.single('arquivo'),
  anexos.tratarErroDeUpload,
  rota(async (req, res) => {
    if (!req.file) throw new Error('Nenhum arquivo recebido.');
    const resultado = await reembolsos.anexarComprovante(
      Number(req.params.despesaId),
      req.session.usuario,
      req.file,
    );
    res.status(201).json(resultado);
  }),
);

// ------------------------------- Despesas -------------------------------
const esquemaDespesa = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data no formato AAAA-MM-DD.'),
  categoria: z.string().trim().min(1, 'Escolha a categoria.'),
  valor: z.union([z.number(), z.string()]),
  descricao: z.string().trim().max(300).optional().nullable(),
  fornecedor: z.string().trim().max(150).optional().nullable(),
  projeto: z.string().trim().max(150).optional().nullable(),
  justificativa: z.string().trim().max(1000).optional().nullable(),
});

router.patch('/despesas/:despesaId', validarCorpo(esquemaDespesa.partial()), rota(async (req, res) => {
  res.json(reembolsos.atualizarDespesa(Number(req.params.despesaId), req.session.usuario, req.dados));
}));

router.delete('/despesas/:despesaId', rota(async (req, res) => {
  res.json(reembolsos.removerDespesa(Number(req.params.despesaId), req.session.usuario));
}));

// ------------------------------ Relatórios ------------------------------
const esquemaRelatorio = z.object({
  titulo: z.string().trim().min(3, 'Dê um título ao relatório.').max(150),
  centroCusto: z.string().trim().max(100).optional().nullable(),
});

router.post('/', validarCorpo(esquemaRelatorio), rota(async (req, res) => {
  res.status(201).json(reembolsos.criar({ usuario: req.session.usuario, ...req.dados }));
}));

router.get('/:id', rota(async (req, res) => {
  res.json(reembolsos.obter(Number(req.params.id), req.session.usuario));
}));

router.patch('/:id', validarCorpo(esquemaRelatorio.partial()), rota(async (req, res) => {
  res.json(reembolsos.atualizar(Number(req.params.id), req.session.usuario, req.dados));
}));

router.delete('/:id', rota(async (req, res) => {
  res.json(reembolsos.excluir(Number(req.params.id), req.session.usuario));
}));

router.post('/:id/despesas', validarCorpo(esquemaDespesa), rota(async (req, res) => {
  res.status(201).json(reembolsos.adicionarDespesa(Number(req.params.id), req.session.usuario, req.dados));
}));

router.post('/:id/enviar', rota(async (req, res) => {
  res.json(reembolsos.enviar(Number(req.params.id), req.session.usuario));
}));

const esquemaDecisao = z.object({
  decisao: z.enum(['aprovar', 'rejeitar', 'devolver']),
  comentario: z.string().trim().max(1000).optional().nullable(),
});

router.post('/:id/decisao', validarCorpo(esquemaDecisao), rota(async (req, res) => {
  res.json(reembolsos.decidir(Number(req.params.id), req.session.usuario, req.dados));
}));

router.post('/:id/pagar', exigirPapel('financeiro'), rota(async (req, res) => {
  res.json(reembolsos.marcarPago(Number(req.params.id), req.session.usuario, req.body || {}));
}));

module.exports = router;
