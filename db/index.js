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
