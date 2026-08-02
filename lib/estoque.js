'use strict';

const { consultar, consultarUm, executar, emTransacao } = require('../db');
const { ErroApp } = require('./erros');

function listarProdutos() {
  return consultar('SELECT * FROM produtos ORDER BY nome');
}

function listarEstoque() {
  return consultar(`
    SELECT e.*, p.nome as produto_nome, p.codigo as produto_codigo, p.unidade_medida, l.nome as local_nome
    FROM estoques e
    JOIN produtos p ON e.produto_id = p.id
    JOIN estoque_locais l ON e.local_id = l.id
    ORDER BY p.nome
  `);
}

function listarMovimentacoes(produto_id = null) {
  let query = `
    SELECT m.*, p.nome as produto_nome, l.nome as local_nome
    FROM estoque_movimentacoes m
    JOIN produtos p ON m.produto_id = p.id
    JOIN estoque_locais l ON m.local_id = l.id
  `;
  const params = [];

  if (produto_id) {
    query += ' WHERE m.produto_id = ?';
    params.push(produto_id);
  }

  query += ' ORDER BY m.criado_em DESC LIMIT 100';

  return consultar(query, ...params);
}

function registrarMovimentacao({ produto_id, local_id, tipo, quantidade, motivo, usuario_email, referencia }) {
  if (quantidade <= 0) {
    throw new ErroApp('A quantidade deve ser maior que zero.', { codigo: 'quantidade_invalida' });
  }
  if (!['entrada', 'saida', 'ajuste'].includes(tipo)) {
    throw new ErroApp('Tipo de movimentação inválido.', { codigo: 'tipo_invalido' });
  }

  return emTransacao(() => {
    // Insere ou atualiza o saldo na tabela de estoques
    const estoqueAtual = consultarUm(
      'SELECT quantidade FROM estoques WHERE produto_id = ? AND local_id = ?',
      produto_id, local_id
    );

    let novaQuantidade = 0;

    if (estoqueAtual) {
      if (tipo === 'entrada') {
        novaQuantidade = estoqueAtual.quantidade + quantidade;
      } else if (tipo === 'saida') {
        novaQuantidade = estoqueAtual.quantidade - quantidade;
        if (novaQuantidade < 0) {
          throw new ErroApp('Estoque insuficiente para esta saída.', { codigo: 'estoque_insuficiente' });
        }
      } else if (tipo === 'ajuste') {
        novaQuantidade = quantidade;
      }

      executar(
        `UPDATE estoques SET quantidade = ?, atualizado_em = datetime('now') WHERE produto_id = ? AND local_id = ?`,
        novaQuantidade, produto_id, local_id
      );
    } else {
      if (tipo === 'saida') {
        throw new ErroApp('Estoque insuficiente para esta saída.', { codigo: 'estoque_insuficiente' });
      }
      novaQuantidade = quantidade;
      executar(
        'INSERT INTO estoques (produto_id, local_id, quantidade) VALUES (?, ?, ?)',
        produto_id, local_id, novaQuantidade
      );
    }

    // Registra o histórico
    const res = executar(
      `INSERT INTO estoque_movimentacoes (produto_id, local_id, tipo, quantidade, motivo, usuario_email, referencia)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      produto_id, local_id, tipo, quantidade, motivo, usuario_email, referencia
    );

    return consultarUm('SELECT * FROM estoque_movimentacoes WHERE id = ?', res.lastInsertRowid);
  })();
}

module.exports = {
  listarProdutos,
  listarEstoque,
  listarMovimentacoes,
  registrarMovimentacao,
};
