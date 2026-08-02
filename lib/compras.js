'use strict';

const { consultar, consultarUm, executar, emTransacao } = require('../db');
const { ErroApp } = require('./erros');

function listarFornecedores() {
  return consultar('SELECT * FROM fornecedores ORDER BY razao_social');
}

function listarSolicitacoes() {
  const solicitacoes = consultar('SELECT * FROM compras_solicitacoes ORDER BY criado_em DESC');
  for (const sol of solicitacoes) {
    sol.itens = consultar(`
      SELECT i.*, p.nome as produto_nome, p.unidade_medida
      FROM compras_solicitacao_itens i
      JOIN produtos p ON i.produto_id = p.id
      WHERE i.solicitacao_id = ?
    `, sol.id);
  }
  return solicitacoes;
}

function criarSolicitacao({ solicitante_email, centro_custo, justificativa, itens }) {
  if (!itens || itens.length === 0) {
    throw new ErroApp('Uma solicitação de compra precisa ter pelo menos um item.', { codigo: 'sem_itens' });
  }

  return emTransacao(() => {
    const res = executar(
      `INSERT INTO compras_solicitacoes (solicitante_email, centro_custo, justificativa)
       VALUES (?, ?, ?)`,
      solicitante_email, centro_custo, justificativa
    );
    const solicitacaoId = res.lastInsertRowid;

    for (const item of itens) {
      executar(
        `INSERT INTO compras_solicitacao_itens (solicitacao_id, produto_id, quantidade)
         VALUES (?, ?, ?)`,
        solicitacaoId, item.produto_id, item.quantidade
      );
    }

    return consultarUm('SELECT * FROM compras_solicitacoes WHERE id = ?', solicitacaoId);
  })();
}

module.exports = {
  listarFornecedores,
  listarSolicitacoes,
  criarSolicitacao,
};
