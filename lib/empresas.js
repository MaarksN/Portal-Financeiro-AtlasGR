'use strict';

const { consultar, consultarUm, executar } = require('../db');
const { ErroApp, naoEncontrado, conflito } = require('./erros');
const auditoria = require('./auditoria');

// ------------------------------------------------------------------
// Empresas e filiais. Schema simples (cnpj, razão social, nome
// fantasia, ativo) — o que a leva de migrações "onda-N" já trouxe
// pro banco. Este módulo é o CRUD real em cima dele.
// ------------------------------------------------------------------

// Dígito verificador do CNPJ — recusamos entrada malformada em vez de
// só validar tamanho, já que o campo alimenta emissão fiscal mais
// adiante.
function cnpjValido(cnpj) {
  const digitos = String(cnpj).replace(/\D/g, '');
  if (digitos.length !== 14 || /^(\d)\1{13}$/.test(digitos)) return false;

  const calcularDigito = (base) => {
    const pesos = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split('').reduce((total, n, i) => total + Number(n) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const primeiroDigito = calcularDigito(digitos.slice(0, 12));
  const segundoDigito = calcularDigito(digitos.slice(0, 12) + primeiroDigito);
  return digitos === digitos.slice(0, 12) + String(primeiroDigito) + String(segundoDigito);
}

function normalizarCnpj(cnpj) {
  const digitos = String(cnpj || '').replace(/\D/g, '');
  if (!cnpjValido(digitos)) throw new ErroApp('CNPJ inválido.', { codigo: 'cnpj_invalido' });
  return digitos;
}

function paraApiEmpresa(linha, filiais = null) {
  if (!linha) return null;
  return {
    id: linha.id,
    cnpj: linha.cnpj,
    razaoSocial: linha.razao_social,
    nomeFantasia: linha.nome_fantasia,
    ativo: Boolean(linha.ativo),
    criadoEm: linha.criado_em,
    atualizadoEm: linha.atualizado_em,
    filiais: filiais ? filiais.map(paraApiFilial) : undefined,
  };
}

function paraApiFilial(linha) {
  if (!linha) return null;
  return {
    id: linha.id,
    empresaId: linha.empresa_id,
    cnpj: linha.cnpj,
    nome: linha.nome,
    ativo: Boolean(linha.ativo),
    criadoEm: linha.criado_em,
  };
}

function contarFiliaisPorEmpresa() {
  const linhas = consultar(
    `SELECT empresa_id, COUNT(*) AS total, SUM(ativo) AS ativas FROM filiais GROUP BY empresa_id`,
  );
  return Object.fromEntries(linhas.map((l) => [l.empresa_id, { total: l.total, ativas: l.ativas }]));
}

function listar() {
  const contagem = contarFiliaisPorEmpresa();
  return consultar('SELECT * FROM empresas ORDER BY razao_social').map((linha) => ({
    ...paraApiEmpresa(linha),
    filiaisTotal: contagem[linha.id]?.total || 0,
    filiaisAtivas: contagem[linha.id]?.ativas || 0,
  }));
}

function buscarLinha(id) {
  const linha = consultarUm('SELECT * FROM empresas WHERE id = ?', id);
  if (!linha) throw naoEncontrado('Empresa não encontrada.');
  return linha;
}

function obter(id) {
  const linha = buscarLinha(id);
  const filiais = consultar('SELECT * FROM filiais WHERE empresa_id = ? ORDER BY nome', id);
  return paraApiEmpresa(linha, filiais);
}

function validarRazaoSocial(razaoSocial) {
  if (!razaoSocial || !razaoSocial.trim()) {
    throw new ErroApp('Informe a razão social.', { codigo: 'entrada_invalida' });
  }
}

function criar(dados, req) {
  validarRazaoSocial(dados.razaoSocial);
  const cnpj = normalizarCnpj(dados.cnpj);
  if (consultarUm('SELECT id FROM empresas WHERE cnpj = ?', cnpj)) {
    throw conflito('Já existe uma empresa com este CNPJ.');
  }

  const resultado = executar(
    `INSERT INTO empresas (cnpj, razao_social, nome_fantasia) VALUES (?, ?, ?)`,
    cnpj, dados.razaoSocial.trim(), dados.nomeFantasia || null,
  );

  auditoria.registrarDaRequisicao(req, { acao: 'empresa.criada', entidade: 'empresa', entidadeId: resultado.lastInsertRowid });
  return obter(resultado.lastInsertRowid);
}

function atualizar(id, dados, req) {
  const atual = buscarLinha(id);
  const razaoSocial = dados.razaoSocial !== undefined ? dados.razaoSocial : atual.razao_social;
  validarRazaoSocial(razaoSocial);

  const cnpj = dados.cnpj !== undefined ? normalizarCnpj(dados.cnpj) : atual.cnpj;
  if (cnpj !== atual.cnpj && consultarUm('SELECT id FROM empresas WHERE cnpj = ? AND id != ?', cnpj, id)) {
    throw conflito('Já existe uma empresa com este CNPJ.');
  }

  executar(
    `UPDATE empresas SET cnpj = ?, razao_social = ?, nome_fantasia = ?, atualizado_em = datetime('now') WHERE id = ?`,
    cnpj, razaoSocial.trim(),
    dados.nomeFantasia !== undefined ? dados.nomeFantasia : atual.nome_fantasia,
    id,
  );

  auditoria.registrarDaRequisicao(req, { acao: 'empresa.atualizada', entidade: 'empresa', entidadeId: id, detalhe: dados });
  return obter(id);
}

function definirAtiva(id, ativo, req) {
  buscarLinha(id);
  executar(`UPDATE empresas SET ativo = ?, atualizado_em = datetime('now') WHERE id = ?`, ativo ? 1 : 0, id);
  auditoria.registrarDaRequisicao(req, {
    acao: ativo ? 'empresa.ativada' : 'empresa.desativada', entidade: 'empresa', entidadeId: id,
  });
  return obter(id);
}

// -------------------------------- Filiais --------------------------------

function buscarFilialLinha(id) {
  const linha = consultarUm('SELECT * FROM filiais WHERE id = ?', id);
  if (!linha) throw naoEncontrado('Filial não encontrada.');
  return linha;
}

function criarFilial(empresaId, dados, req) {
  buscarLinha(empresaId); // garante que a empresa existe
  if (!dados.nome || !dados.nome.trim()) throw new ErroApp('Informe o nome da filial.', { codigo: 'entrada_invalida' });
  const cnpj = normalizarCnpj(dados.cnpj);
  if (consultarUm('SELECT id FROM filiais WHERE cnpj = ?', cnpj)) {
    throw conflito('Já existe uma filial com este CNPJ.');
  }

  const resultado = executar(
    `INSERT INTO filiais (empresa_id, cnpj, nome) VALUES (?, ?, ?)`,
    empresaId, cnpj, dados.nome.trim(),
  );

  auditoria.registrarDaRequisicao(req, { acao: 'filial.criada', entidade: 'filial', entidadeId: resultado.lastInsertRowid });
  return paraApiFilial(buscarFilialLinha(resultado.lastInsertRowid));
}

function atualizarFilial(id, dados, req) {
  const atual = buscarFilialLinha(id);
  const nome = dados.nome !== undefined ? dados.nome : atual.nome;
  if (!nome || !nome.trim()) throw new ErroApp('Informe o nome da filial.', { codigo: 'entrada_invalida' });

  const cnpj = dados.cnpj !== undefined ? normalizarCnpj(dados.cnpj) : atual.cnpj;
  if (cnpj !== atual.cnpj && consultarUm('SELECT id FROM filiais WHERE cnpj = ? AND id != ?', cnpj, id)) {
    throw conflito('Já existe uma filial com este CNPJ.');
  }

  executar(
    `UPDATE filiais SET cnpj = ?, nome = ?, atualizado_em = datetime('now') WHERE id = ?`,
    cnpj, nome.trim(), id,
  );

  auditoria.registrarDaRequisicao(req, { acao: 'filial.atualizada', entidade: 'filial', entidadeId: id, detalhe: dados });
  return paraApiFilial(buscarFilialLinha(id));
}

function definirFilialAtiva(id, ativo, req) {
  buscarFilialLinha(id);
  executar(`UPDATE filiais SET ativo = ?, atualizado_em = datetime('now') WHERE id = ?`, ativo ? 1 : 0, id);
  auditoria.registrarDaRequisicao(req, {
    acao: ativo ? 'filial.ativada' : 'filial.desativada', entidade: 'filial', entidadeId: id,
  });
  return paraApiFilial(buscarFilialLinha(id));
}

module.exports = {
  listar,
  obter,
  criar,
  atualizar,
  definirAtiva,
  criarFilial,
  atualizarFilial,
  definirFilialAtiva,
};
