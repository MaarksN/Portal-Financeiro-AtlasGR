'use strict';

const { executar, consultar } = require('../db');

// Trilha append-only. Nada aqui atualiza ou apaga linha — se um registro
// precisa ser corrigido, entra uma nova linha descrevendo a correção.

function registrar({ ator, acao, entidade, entidadeId = null, detalhe = null, ip = null }) {
  executar(
    `INSERT INTO auditoria (ator_email, acao, entidade, entidade_id, detalhe, ip)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ator || null,
    acao,
    entidade,
    entidadeId === null ? null : String(entidadeId),
    detalhe ? JSON.stringify(detalhe) : null,
    ip,
  );
}

// Atalho para uso dentro de rota — pega o ator e o IP do request.
function registrarDaRequisicao(req, { acao, entidade, entidadeId, detalhe }) {
  registrar({
    ator: req.session?.usuario?.email,
    acao,
    entidade,
    entidadeId,
    detalhe,
    ip: req.ip,
  });
}

function historicoDe(entidade, entidadeId, limite = 100) {
  return consultar(
    `SELECT id, ator_email, acao, detalhe, criado_em
       FROM auditoria
      WHERE entidade = ? AND entidade_id = ?
      ORDER BY id DESC
      LIMIT ?`,
    entidade,
    String(entidadeId),
    limite,
  );
}

module.exports = { registrar, registrarDaRequisicao, historicoDe };
