'use strict';

const express = require('express');
const multer = require('multer');

const config = require('../config');
const conectores = require('../lib/conectores');
const espelho = require('../lib/espelho');
const bitrix = require('../lib/bitrix');
const { consultar } = require('../db');
const { rota, ErroApp } = require('../lib/erros');
const { exigirPapel } = require('../lib/seguranca');

const router = express.Router();

// CSV vai para a memória: o arquivo é lido, transformado em linhas e
// descartado — não faz sentido guardar a planilha em disco.
const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, arquivo, callback) => {
    const aceitos = ['text/csv', 'application/vnd.ms-excel', 'text/plain', 'application/csv'];
    if (!aceitos.includes(arquivo.mimetype) && !/\.csv$/i.test(arquivo.originalname)) {
      return callback(new ErroApp('Envie um arquivo .csv.', { codigo: 'arquivo_invalido' }));
    }
    return callback(null, true);
  },
});

// ------------------------------- Saúde -------------------------------
router.get('/saude', rota(async (req, res) => {
  const verificar = req.query.verificar === '1';

  const integracoes = {
    bitrix: { configurado: Boolean(config.bitrix?.configurado) },
    d4sign: { configurado: Boolean(config.d4sign?.configurado) },
    nxfacil: { configurado: Boolean(config.nxfacil?.configurado), modo: config.nxfacil?.modo || 'mock' },
    sicredi: { configurado: Boolean(config.sicredi?.configurado) },
    ia: { configurado: Boolean(config.ia?.configurado), provider: config.ia?.provider },
    integracao: { configurado: Boolean(config.integracao?.configurado) },
    jira: { configurado: false, projeto: 'n/a' },
  };

  // A verificação ativa bate na API de verdade — só sob pedido, para
  // o painel não gastar chamada a cada carregamento.
  if (verificar) {
    if (config.bitrix?.configurado) {
      integracoes.bitrix.checagem = await bitrix.verificar().catch((erro) => ({ ok: false, erro: erro.message }));
    }
  }

  res.json({
    ok: true,
    ambiente: config.ambiente,
    modoDemo: config.demo,
    integracoes,
    fontes: conectores.situacao ? conectores.situacao() : [],
    espelho: espelho.situacaoDaFila ? espelho.situacaoDaFila() : { pendentes: 0, enviados: 0, falhados: 0 },
    sincronizacaoAutomaticaMinutos: config.sincronizacao?.intervaloMinutos ?? 15,
  });
}));

// --------------------------- Fontes e sincronia ---------------------------
router.get('/fontes', exigirPapel('financeiro', 'ti'), (req, res) => {
  res.json({
    fontes: conectores.situacao(),
    historico: consultar(
      `SELECT fonte, estado, registros, novos, atualizados, erro, iniciado_em, terminado_em
         FROM sincronizacoes ORDER BY id DESC LIMIT 30`,
    ),
  });
});

router.post('/sincronizar', exigirPapel('financeiro', 'ti'), rota(async (req, res) => {
  const cobrancas = await conectores.sincronizarTudo();
  const fila = await espelho.processarFila();
  res.json({ cobrancas, espelho: { fila } });
}));

router.post(
  '/fontes/importar-csv',
  exigirPapel('financeiro'),
  uploadCsv.single('arquivo'),
  rota(async (req, res) => {
    if (!req.file) throw new ErroApp('Nenhum arquivo recebido.', { codigo: 'arquivo_invalido' });
    const conteudo = req.file.buffer.toString('utf8');
    res.json(conectores.importarCsv(conteudo, { autor: req.session.usuario.email }));
  }),
);

module.exports = router;
