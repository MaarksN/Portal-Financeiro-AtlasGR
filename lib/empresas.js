'use strict';

const { consultar, consultarUm, executar, emTransacao } = require('../db');
const { ErroApp } = require('./erros');
const auditoria = require('./auditoria');

// ============================== Empresas ==============================

function listarEmpresas(apenasAtivas = false) {
  const where = apenasAtivas ? 'WHERE ativo = 1' : '';
  return consultar(`SELECT * FROM empresas ${where} ORDER BY razao_social`);
}

function obterEmpresa(id) {
  const empresa = consultarUm('SELECT * FROM empresas WHERE id = ?', id);
  if (!empresa) throw new ErroApp('Empresa não encontrada.', { status: 404, codigo: 'nao_encontrada' });
  return empresa;
}

function criarEmpresa(dados, atorEmail) {
  const existente = consultarUm('SELECT id FROM empresas WHERE cnpj = ?', dados.cnpj);
  if (existente) throw new ErroApp('Já existe uma empresa com este CNPJ.', { status: 409, codigo: 'conflito' });

  const id = executar(
    `INSERT INTO empresas (cnpj, razao_social, nome_fantasia, ativo)
     VALUES (?, ?, ?, ?)`,
    dados.cnpj, dados.razao_social, dados.nome_fantasia || null, dados.ativo ?? 1
  ).lastInsertRowid;

  const nova = obterEmpresa(id);
  auditoria.registrar({ ator: atorEmail, acao: 'empresa.criada', entidade: 'empresa', entidadeId: id });
  return nova;
}

// ============================== Filiais ==============================

function listarFiliais(empresaId, apenasAtivas = false) {
  const where = apenasAtivas ? 'AND ativo = 1' : '';
  return consultar(`SELECT * FROM filiais WHERE empresa_id = ? ${where} ORDER BY nome`, empresaId);
}

function obterFilial(id) {
  const filial = consultarUm('SELECT * FROM filiais WHERE id = ?', id);
  if (!filial) throw new ErroApp('Filial não encontrada.', { status: 404, codigo: 'nao_encontrada' });
  return filial;
}

function criarFilial(empresaId, dados, atorEmail) {
  const existente = consultarUm('SELECT id FROM filiais WHERE cnpj = ?', dados.cnpj);
  if (existente) throw new ErroApp('Já existe uma filial com este CNPJ.', { status: 409, codigo: 'conflito' });

  const id = executar(
    `INSERT INTO filiais (empresa_id, cnpj, nome, ativo)
     VALUES (?, ?, ?, ?)`,
    empresaId, dados.cnpj, dados.nome, dados.ativo ?? 1
  ).lastInsertRowid;

  const nova = obterFilial(id);
  auditoria.registrar({ ator: atorEmail, acao: 'filial.criada', entidade: 'filial', entidadeId: id });
  return nova;
}

module.exports = {
  listarEmpresas,
  obterEmpresa,
  criarEmpresa,
  listarFiliais,
  obterFilial,
  criarFilial,
};
