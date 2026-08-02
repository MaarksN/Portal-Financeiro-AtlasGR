'use strict';

const { Store } = require('express-session');

const { consultarUm, executar } = require('../db');
const log = require('./log');

// ------------------------------------------------------------------
// Sessão no SQLite. O store em memória do express-session perde tudo
// a cada restart (e o `node --watch` reinicia o tempo inteiro), além
// de vazar memória em produção. Como já temos banco, guardamos aqui.
// ------------------------------------------------------------------

class LojaDeSessaoSqlite extends Store {
  constructor({ intervaloLimpezaMs = 15 * 60 * 1000 } = {}) {
    super();
    this.limpar();
    this.temporizador = setInterval(() => this.limpar(), intervaloLimpezaMs);
    // Não segura o processo vivo só por causa da limpeza.
    if (this.temporizador.unref) this.temporizador.unref();
  }

  get(sid, callback) {
    try {
      const linha = consultarUm('SELECT dados, expira_em FROM sessoes WHERE sid = ?', sid);
      if (!linha) return callback(null, null);
      if (linha.expira_em < Date.now()) {
        executar('DELETE FROM sessoes WHERE sid = ?', sid);
        return callback(null, null);
      }
      return callback(null, JSON.parse(linha.dados));
    } catch (erro) {
      return callback(erro);
    }
  }

  set(sid, sessao, callback) {
    try {
      executar(
        `INSERT INTO sessoes (sid, dados, expira_em) VALUES (?, ?, ?)
         ON CONFLICT (sid) DO UPDATE SET dados = excluded.dados, expira_em = excluded.expira_em`,
        sid,
        JSON.stringify(sessao),
        this.expiracaoDe(sessao),
      );
      return callback(null);
    } catch (erro) {
      return callback(erro);
    }
  }

  destroy(sid, callback) {
    try {
      executar('DELETE FROM sessoes WHERE sid = ?', sid);
      return callback(null);
    } catch (erro) {
      return callback(erro);
    }
  }

  // Renova só a expiração — evita reescrever o JSON inteiro a cada
  // requisição de usuário ativo.
  touch(sid, sessao, callback) {
    try {
      executar('UPDATE sessoes SET expira_em = ? WHERE sid = ?', this.expiracaoDe(sessao), sid);
      return callback(null);
    } catch (erro) {
      return callback(erro);
    }
  }

  expiracaoDe(sessao) {
    const expira = sessao?.cookie?.expires;
    if (expira) return new Date(expira).getTime();
    const maxIdade = sessao?.cookie?.maxAge;
    return Date.now() + (maxIdade || 8 * 60 * 60 * 1000);
  }

  limpar() {
    try {
      const { changes } = executar('DELETE FROM sessoes WHERE expira_em < ?', Date.now());
      if (changes > 0) log.debug('Sessões expiradas removidas', { total: changes });
    } catch (erro) {
      log.aviso('Falha ao limpar sessões expiradas', { erro: erro.message });
    }
  }
}

module.exports = { LojaDeSessaoSqlite };
