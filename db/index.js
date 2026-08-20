'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const dbPath = config.caminhos.db;
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Executa automaticamente as migrações em ordem se o diretório existir
const migracoesDir = path.join(__dirname, 'migracoes');
if (fs.existsSync(migracoesDir)) {
  const arquivos = fs.readdirSync(migracoesDir).filter((f) => f.endsWith('.sql')).sort();
  for (const arq of arquivos) {
    const conteudoSql = fs.readFileSync(path.join(migracoesDir, arq), 'utf8');
    try {
      db.exec(conteudoSql);
    } catch (e) {
      // Ignora erros de tabelas ou colunas que já existem
    }
  }
}

const consultar = (sql, ...params) => db.prepare(sql).all(...params);
const consultarUm = (sql, ...params) => db.prepare(sql).get(...params);
const executar = (sql, ...params) => db.prepare(sql).run(...params);
const agoraIso = () => new Date().toISOString();

const emTransacao = (fn) => db.transaction(fn);

module.exports = {
  db,
  consultar,
  consultarUm,
  executar,
  agoraIso,
  emTransacao,
};
