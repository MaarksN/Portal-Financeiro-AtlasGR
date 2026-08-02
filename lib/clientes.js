'use strict';

const { consultar, consultarUm, executar, agoraIso } = require('../db');
const { ErroApp } = require('./erros');
const auditoria = require('./auditoria');

function listar() {
  return consultar('SELECT * FROM clientes ORDER BY nome');
}

function porId(id) {
  const linha = consultarUm('SELECT * FROM clientes WHERE id = ?', id);
  if (!linha) throw new ErroApp('Cliente não encontrado.', { status: 404, codigo: 'nao_encontrado' });
  return linha;
}

function criar(dados, atorEmail) {
  const { tipo, nome, documento, email, telefone, endereco, limiteCredito, vendedorEmail } = dados;

  const resultado = executar(
    `INSERT INTO clientes (tipo, nome, documento, email, telefone, endereco, limite_credito, vendedor_email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    tipo, nome, documento, email, telefone, endereco, limiteCredito || 0, vendedorEmail
  );

  const cliente = porId(resultado.lastInsertRowid);
  auditoria.registrar({ ator: atorEmail, acao: 'cliente.criado', entidade: 'cliente', entidadeId: cliente.id });
  return cliente;
}

function atualizar(id, dados, atorEmail) {
  const existente = porId(id);

  executar(
    `UPDATE clientes
        SET tipo = ?,
            nome = ?,
            documento = ?,
            email = ?,
            telefone = ?,
            endereco = ?,
            limite_credito = ?,
            vendedor_email = ?,
            atualizado_em = ?
      WHERE id = ?`,
    dados.tipo || existente.tipo,
    dados.nome || existente.nome,
    dados.documento || existente.documento,
    dados.email || existente.email,
    dados.telefone || existente.telefone,
    dados.endereco || existente.endereco,
    dados.limiteCredito !== undefined ? dados.limiteCredito : existente.limite_credito,
    dados.vendedorEmail || existente.vendedor_email,
    agoraIso(),
    id
  );

  const cliente = porId(id);
  auditoria.registrar({ ator: atorEmail, acao: 'cliente.atualizado', entidade: 'cliente', entidadeId: cliente.id });
  return cliente;
}

module.exports = {
  listar,
  porId,
  criar,
  atualizar,
};
