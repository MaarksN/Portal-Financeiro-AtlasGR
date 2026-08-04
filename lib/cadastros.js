'use strict';

const { consultar, consultarUm, executar } = require('../db');
const { ErroApp } = require('./erros');
const auditoria = require('./auditoria');

// ============================== Clientes ==============================

function listarClientes() {
  return consultar('SELECT * FROM clientes ORDER BY nome');
}

function criarCliente(dados, atorEmail) {
  const existente = consultarUm('SELECT id FROM clientes WHERE documento = ?', dados.documento);
  if (existente) throw new ErroApp('Já existe um cliente com este documento.', { status: 409, codigo: 'conflito' });

  const somenteDigitos = String(dados.documento || '').replace(/\D/g, '');
  const tipo = somenteDigitos.length <= 11 ? 'PF' : 'PJ';

  const id = executar(
    `INSERT INTO clientes (tipo, documento, nome, email, telefone)
     VALUES (?, ?, ?, ?, ?)`,
    tipo, dados.documento, dados.nome, dados.email || null, dados.telefone || null
  ).lastInsertRowid;

  auditoria.registrar({ ator: atorEmail, acao: 'cliente.criado', entidade: 'cliente', entidadeId: id });
  return consultarUm('SELECT * FROM clientes WHERE id = ?', id);
}

// ============================== Fornecedores ==============================

function listarFornecedores() {
  return consultar('SELECT * FROM fornecedores ORDER BY nome');
}

function criarFornecedor(dados, atorEmail) {
  const existente = consultarUm('SELECT id FROM fornecedores WHERE documento = ?', dados.documento);
  if (existente) throw new ErroApp('Já existe um fornecedor com este documento.', { status: 409, codigo: 'conflito' });

  const id = executar(
    `INSERT INTO fornecedores (documento, nome, email, telefone)
     VALUES (?, ?, ?, ?)`,
    dados.documento, dados.nome, dados.email || null, dados.telefone || null
  ).lastInsertRowid;

  auditoria.registrar({ ator: atorEmail, acao: 'fornecedor.criado', entidade: 'fornecedor', entidadeId: id });
  return consultarUm('SELECT * FROM fornecedores WHERE id = ?', id);
}

// ============================== Produtos ==============================

function listarProdutos(apenasAtivos = false) {
  return consultar('SELECT * FROM produtos ORDER BY nome');
}

function criarProduto(dados, atorEmail) {
  const id = executar(
    `INSERT INTO produtos (nome, descricao, preco_centavos)
     VALUES (?, ?, ?)`,
    dados.nome, dados.descricao || null, dados.preco_centavos || 0
  ).lastInsertRowid;

  auditoria.registrar({ ator: atorEmail, acao: 'produto.criado', entidade: 'produto', entidadeId: id });
  return consultarUm('SELECT * FROM produtos WHERE id = ?', id);
}

// ============================== Serviços ==============================

function listarServicos(apenasAtivos = false) {
  return consultar('SELECT * FROM servicos ORDER BY nome');
}

function criarServico(dados, atorEmail) {
  const id = executar(
    `INSERT INTO servicos (nome, descricao, preco_centavos)
     VALUES (?, ?, ?)`,
    dados.nome, dados.descricao || null, dados.preco_centavos || 0
  ).lastInsertRowid;

  auditoria.registrar({ ator: atorEmail, acao: 'servico.criado', entidade: 'servico', entidadeId: id });
  return consultarUm('SELECT * FROM servicos WHERE id = ?', id);
}

module.exports = {
  listarClientes,
  criarCliente,
  listarFornecedores,
  criarFornecedor,
  listarProdutos,
  criarProduto,
  listarServicos,
  criarServico,
};
