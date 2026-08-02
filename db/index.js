'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const config = require('../config');
const log = require('../lib/log');

const banco = new Database(config.caminhos.banco);

// WAL: leitura não bloqueia escrita — importante porque o job de
// sincronização escreve enquanto as telas leem.
banco.pragma('journal_mode = WAL');
banco.pragma('foreign_keys = ON');
banco.pragma('busy_timeout = 5000');
banco.pragma('synchronous = NORMAL');

// ------------------------------------------------------------------
// Migrações: arquivos .sql em db/migracoes, aplicados em ordem
// alfabética, uma vez cada, dentro de transação.
// ------------------------------------------------------------------
function migrar() {
  banco.exec(`
    CREATE TABLE IF NOT EXISTS migracoes (
      nome        TEXT PRIMARY KEY,
      aplicada_em TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const pasta = path.join(__dirname, 'migracoes');
  const arquivos = fs.readdirSync(pasta).filter((n) => n.endsWith('.sql')).sort();

  const jaAplicadas = new Set(
    banco.prepare('SELECT nome FROM migracoes').all().map((linha) => linha.nome),
  );

  for (const arquivo of arquivos) {
    if (jaAplicadas.has(arquivo)) continue;
    const sql = fs.readFileSync(path.join(pasta, arquivo), 'utf8');
    const aplicar = banco.transaction(() => {
      banco.exec(sql);
      banco.prepare('INSERT INTO migracoes (nome) VALUES (?)').run(arquivo);
    });
    aplicar();
    log.info('Migração aplicada', { arquivo });
  }
}

migrar();

// ------------------------------------------------------------------
// Açúcar em cima do better-sqlite3. Tudo síncrono — é assim que a
// biblioteca funciona, e para um portal interno é mais rápido e mais
// simples de raciocinar do que o equivalente assíncrono.
// ------------------------------------------------------------------
const consultar = (sql, ...parametros) => banco.prepare(sql).all(...parametros);
const consultarUm = (sql, ...parametros) => banco.prepare(sql).get(...parametros);
const executar = (sql, ...parametros) => banco.prepare(sql).run(...parametros);
const emTransacao = (fn) => banco.transaction(fn);

// JSON guardado em coluna TEXT — sempre passar por aqui pra não
// espalhar try/catch de parse pelo código de domínio.
const lerJson = (texto, padrao) => {
  if (texto === null || texto === undefined || texto === '') return padrao;
  try {
    return JSON.parse(texto);
  } catch {
    return padrao;
  }
};

const agoraIso = () => new Date().toISOString();

process.on('exit', () => banco.close());

module.exports = {
  banco,
  consultar,
  consultarUm,
  executar,
  emTransacao,
  lerJson,
  agoraIso,
};
