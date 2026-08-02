'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const config = require('../config');
const log = require('./log');
const { consultarUm, consultar, executar } = require('../db');
const { ErroApp, naoEncontrado } = require('./erros');

// ------------------------------------------------------------------
// Comprovantes em disco, metadados no banco.
//
// O nome do arquivo em disco é sempre gerado por nós (aleatório +
// extensão da lista branca) — o nome original vai só para o banco.
// Isso mata travessia de caminho e colisão de nome de uma vez, e o
// download é servido por rota autenticada, nunca por estático.
// ------------------------------------------------------------------

const EXTENSOES = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
};

const armazenamento = multer.diskStorage({
  destination: (req, arquivo, callback) => callback(null, config.anexos.pasta),
  filename: (req, arquivo, callback) => {
    const extensao = EXTENSOES[arquivo.mimetype] || '.bin';
    callback(null, `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${extensao}`);
  },
});

const upload = multer({
  storage: armazenamento,
  limits: {
    fileSize: config.anexos.tamanhoMaximo,
    files: 5,
  },
  fileFilter: (req, arquivo, callback) => {
    if (!config.anexos.tiposAceitos.includes(arquivo.mimetype)) {
      return callback(new ErroApp(
        `Tipo de arquivo não aceito (${arquivo.mimetype}). Envie PDF, JPG, PNG ou WEBP.`,
        { codigo: 'anexo_tipo_invalido' },
      ));
    }
    return callback(null, true);
  },
});

// Traduz o erro do multer para a nossa forma antes do handler central.
function tratarErroDeUpload(erro, req, res, next) {
  if (erro instanceof multer.MulterError) {
    const mensagens = {
      LIMIT_FILE_SIZE: `Arquivo maior que o limite de ${Math.round(config.anexos.tamanhoMaximo / 1024 / 1024)} MB.`,
      LIMIT_FILE_COUNT: 'Muitos arquivos de uma vez.',
      LIMIT_UNEXPECTED_FILE: 'Campo de arquivo inesperado.',
    };
    return next(new ErroApp(mensagens[erro.code] || 'Falha no envio do arquivo.', { codigo: 'anexo_invalido' }));
  }
  return next(erro);
}

const hashDe = (caminho) => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256');
  fs.createReadStream(caminho)
    .on('data', (bloco) => hash.update(bloco))
    .on('end', () => resolve(hash.digest('hex')))
    .on('error', reject);
});

async function registrar(arquivo, { relatorioId = null, despesaId = null, enviadoPor }) {
  const caminho = path.join(config.anexos.pasta, arquivo.filename);
  const hash = await hashDe(caminho).catch(() => null);

  const resultado = executar(
    `INSERT INTO anexos (relatorio_id, despesa_id, nome_original, nome_arquivo, tipo, tamanho, hash_sha256, enviado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    relatorioId,
    despesaId,
    arquivo.originalname,
    arquivo.filename,
    arquivo.mimetype,
    arquivo.size,
    hash,
    enviadoPor,
  );

  return consultarUm('SELECT * FROM anexos WHERE id = ?', resultado.lastInsertRowid);
}

const paraApi = (linha) => ({
  id: linha.id,
  nome: linha.nome_original,
  tipo: linha.tipo,
  tamanho: linha.tamanho,
  enviadoPor: linha.enviado_por,
  criadoEm: linha.criado_em,
  url: `/api/reembolsos/anexos/${linha.id}`,
});

const daDespesa = (despesaId) => consultar('SELECT * FROM anexos WHERE despesa_id = ? ORDER BY id', despesaId).map(paraApi);
const doRelatorio = (relatorioId) => consultar(
  `SELECT a.* FROM anexos a
     LEFT JOIN despesas d ON d.id = a.despesa_id
    WHERE a.relatorio_id = ? OR d.relatorio_id = ?
    ORDER BY a.id`,
  relatorioId, relatorioId,
).map(paraApi);

function contarPorDespesa(relatorioId) {
  const linhas = consultar(
    `SELECT d.id AS despesa_id, count(a.id) AS total
       FROM despesas d LEFT JOIN anexos a ON a.despesa_id = d.id
      WHERE d.relatorio_id = ?
      GROUP BY d.id`,
    relatorioId,
  );
  return new Map(linhas.map((l) => [l.despesa_id, l.total]));
}

// Devolve o caminho absoluto para a rota de download, depois de
// confirmar que o arquivo ainda existe no disco.
function caminhoDe(anexoId) {
  const linha = consultarUm('SELECT * FROM anexos WHERE id = ?', anexoId);
  if (!linha) throw naoEncontrado('Comprovante não encontrado.');

  const caminho = path.join(config.anexos.pasta, linha.nome_arquivo);
  // Cinto e suspensório: o nome vem do banco, mas conferimos que ele
  // não escapou da pasta de anexos.
  if (!caminho.startsWith(config.anexos.pasta)) {
    throw new ErroApp('Caminho de anexo inválido.', { status: 400, codigo: 'anexo_invalido' });
  }
  if (!fs.existsSync(caminho)) {
    throw naoEncontrado('O arquivo do comprovante não está mais no servidor.');
  }
  return { linha, caminho };
}

function remover(anexoId) {
  const linha = consultarUm('SELECT * FROM anexos WHERE id = ?', anexoId);
  if (!linha) return false;
  executar('DELETE FROM anexos WHERE id = ?', anexoId);
  try {
    fs.unlinkSync(path.join(config.anexos.pasta, linha.nome_arquivo));
  } catch (erro) {
    // Linha do banco já saiu; arquivo órfão em disco é problema menor.
    log.aviso('Anexo removido do banco mas não do disco', { anexoId, erro: erro.message });
  }
  return true;
}

module.exports = {
  upload,
  tratarErroDeUpload,
  registrar,
  paraApi,
  daDespesa,
  doRelatorio,
  contarPorDespesa,
  caminhoDe,
  remover,
};
