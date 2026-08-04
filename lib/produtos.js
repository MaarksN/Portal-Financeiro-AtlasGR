'use strict';

const { consultar, consultarUm, executar, agoraIso } = require('../db');
const { ErroApp } = require('./erros');
const auditoria = require('./auditoria');

function listar() {
  return consultar('SELECT * FROM produtos ORDER BY nome');
}

function porId(id) {
  const linha = consultarUm('SELECT * FROM produtos WHERE id = ?', id);
  if (!linha) throw new ErroApp('Produto não encontrado.', { status: 404, codigo: 'nao_encontrado' });
  return linha;
}

function criar(dados, atorEmail) {
  const { nome, sku, descricao, categoria, marca, unidade, custoCentavos, precoCentavos } = dados;

  const resultado = executar(
    `INSERT INTO produtos (nome, sku, descricao, categoria, marca, unidade, custo_centavos, preco_centavos)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    nome, sku, descricao, categoria, marca, unidade, custoCentavos || 0, precoCentavos || 0
  );

  const produto = porId(resultado.lastInsertRowid);
  auditoria.registrar({ ator: atorEmail, acao: 'produto.criado', entidade: 'produto', entidadeId: produto.id });
  return produto;
}

function atualizar(id, dados, atorEmail) {
  const existente = porId(id);

  executar(
    `UPDATE produtos
        SET nome = ?,
            sku = ?,
            descricao = ?,
            categoria = ?,
            marca = ?,
            unidade = ?,
            custo_centavos = ?,
            preco_centavos = ?,
            atualizado_em = ?
      WHERE id = ?`,
    dados.nome || existente.nome,
    dados.sku || existente.sku,
    dados.descricao || existente.descricao,
    dados.categoria || existente.categoria,
    dados.marca || existente.marca,
    dados.unidade || existente.unidade,
    dados.custoCentavos !== undefined ? dados.custoCentavos : existente.custo_centavos,
    dados.precoCentavos !== undefined ? dados.precoCentavos : existente.preco_centavos,
    agoraIso(),
    id
  );

  const produto = porId(id);
  auditoria.registrar({ ator: atorEmail, acao: 'produto.atualizado', entidade: 'produto', entidadeId: produto.id });
  return produto;
}

module.exports = {
  listar,
  porId,
  criar,
  atualizar,
};
