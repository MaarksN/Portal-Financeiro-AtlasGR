'use strict';

const { consultar, consultarUm, executar, emTransacao } = require('../db');
const { ErroApp, naoEncontrado, conflito } = require('./erros');
const auditoria = require('./auditoria');

// ------------------------------------------------------------------
// Empresas e filiais — fundação multiempresa/multifilial. Cada usuário,
// caixa e (no futuro) lançamento se prende a uma filial; a filial se
// prende a uma empresa. Por ora só uma empresa/filial existe (semeada
// pela migração 002); este módulo é o CRUD real em cima dela.
// ------------------------------------------------------------------

const REGIMES = new Set(['simples', 'lucro_presumido', 'lucro_real']);

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
  if (!cnpj) return null;
  const digitos = String(cnpj).replace(/\D/g, '');
  if (!cnpjValido(digitos)) throw new ErroApp('CNPJ inválido.', { codigo: 'cnpj_invalido' });
  return digitos;
}

function paraApiEmpresa(linha, filiais = null) {
  if (!linha) return null;
  return {
    id: linha.id,
    nome: linha.nome,
    razaoSocial: linha.razao_social,
    cnpj: linha.cnpj,
    inscricaoEstadual: linha.inscricao_estadual,
    inscricaoMunicipal: linha.inscricao_municipal,
    regimeTributario: linha.regime_tributario,
    endereco: linha.endereco ? JSON.parse(linha.endereco) : null,
    telefone: linha.telefone,
    email: linha.email,
    site: linha.site,
    ativa: Boolean(linha.ativa),
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
    nome: linha.nome,
    cnpj: linha.cnpj,
    inscricaoEstadual: linha.inscricao_estadual,
    inscricaoMunicipal: linha.inscricao_municipal,
    endereco: linha.endereco ? JSON.parse(linha.endereco) : null,
    telefone: linha.telefone,
    email: linha.email,
    ativa: Boolean(linha.ativa),
    principal: Boolean(linha.principal),
    criadoEm: linha.criado_em,
  };
}

function contarFiliaisPorEmpresa() {
  const linhas = consultar(
    `SELECT empresa_id, COUNT(*) AS total, SUM(ativa) AS ativas FROM filiais GROUP BY empresa_id`,
  );
  return Object.fromEntries(linhas.map((l) => [l.empresa_id, { total: l.total, ativas: l.ativas }]));
}

function listar() {
  const contagem = contarFiliaisPorEmpresa();
  return consultar('SELECT * FROM empresas ORDER BY nome').map((linha) => ({
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
  const filiais = consultar('SELECT * FROM filiais WHERE empresa_id = ? ORDER BY principal DESC, nome', id);
  return paraApiEmpresa(linha, filiais);
}

function validarCamposEmpresa({ nome, regimeTributario }) {
  if (!nome || !nome.trim()) throw new ErroApp('Informe o nome da empresa.', { codigo: 'entrada_invalida' });
  if (regimeTributario && !REGIMES.has(regimeTributario)) {
    throw new ErroApp('Regime tributário inválido.', { codigo: 'entrada_invalida' });
  }
}

function criar(dados, req) {
  validarCamposEmpresa(dados);
  const cnpj = normalizarCnpj(dados.cnpj);
  if (cnpj && consultarUm('SELECT id FROM empresas WHERE cnpj = ?', cnpj)) {
    throw conflito('Já existe uma empresa com este CNPJ.');
  }

  const resultado = emTransacao(() => {
    const inserida = executar(
      `INSERT INTO empresas (nome, razao_social, cnpj, inscricao_estadual, inscricao_municipal,
                              regime_tributario, endereco, telefone, email, site)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      dados.nome.trim(), dados.razaoSocial || null, cnpj, dados.inscricaoEstadual || null,
      dados.inscricaoMunicipal || null, dados.regimeTributario || 'simples',
      dados.endereco ? JSON.stringify(dados.endereco) : null,
      dados.telefone || null, dados.email || null, dados.site || null,
    );
    const empresaId = inserida.lastInsertRowid;
    executar(
      `INSERT INTO filiais (empresa_id, nome, ativa, principal) VALUES (?, 'Matriz', 1, 1)`,
      empresaId,
    );
    return empresaId;
  })();

  auditoria.registrarDaRequisicao(req, { acao: 'empresa.criada', entidade: 'empresa', entidadeId: resultado });
  return obter(resultado);
}

function atualizar(id, dados, req) {
  const atual = buscarLinha(id);
  validarCamposEmpresa({ nome: dados.nome ?? atual.nome, regimeTributario: dados.regimeTributario });
  const cnpj = dados.cnpj !== undefined ? normalizarCnpj(dados.cnpj) : atual.cnpj;
  if (cnpj && cnpj !== atual.cnpj && consultarUm('SELECT id FROM empresas WHERE cnpj = ? AND id != ?', cnpj, id)) {
    throw conflito('Já existe uma empresa com este CNPJ.');
  }

  executar(
    `UPDATE empresas
        SET nome = ?, razao_social = ?, cnpj = ?, inscricao_estadual = ?, inscricao_municipal = ?,
            regime_tributario = ?, endereco = ?, telefone = ?, email = ?, site = ?,
            atualizado_em = datetime('now')
      WHERE id = ?`,
    (dados.nome ?? atual.nome).trim(),
    dados.razaoSocial !== undefined ? dados.razaoSocial : atual.razao_social,
    cnpj,
    dados.inscricaoEstadual !== undefined ? dados.inscricaoEstadual : atual.inscricao_estadual,
    dados.inscricaoMunicipal !== undefined ? dados.inscricaoMunicipal : atual.inscricao_municipal,
    dados.regimeTributario || atual.regime_tributario,
    dados.endereco !== undefined ? (dados.endereco ? JSON.stringify(dados.endereco) : null) : atual.endereco,
    dados.telefone !== undefined ? dados.telefone : atual.telefone,
    dados.email !== undefined ? dados.email : atual.email,
    dados.site !== undefined ? dados.site : atual.site,
    id,
  );

  auditoria.registrarDaRequisicao(req, { acao: 'empresa.atualizada', entidade: 'empresa', entidadeId: id, detalhe: dados });
  return obter(id);
}

function definirAtiva(id, ativa, req) {
  buscarLinha(id);
  executar(`UPDATE empresas SET ativa = ?, atualizado_em = datetime('now') WHERE id = ?`, ativa ? 1 : 0, id);
  auditoria.registrarDaRequisicao(req, {
    acao: ativa ? 'empresa.ativada' : 'empresa.desativada', entidade: 'empresa', entidadeId: id,
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

  const resultado = emTransacao(() => {
    if (dados.principal) {
      executar('UPDATE filiais SET principal = 0 WHERE empresa_id = ?', empresaId);
    }
    return executar(
      `INSERT INTO filiais (empresa_id, nome, cnpj, inscricao_estadual, inscricao_municipal, endereco, telefone, email, principal)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      empresaId, dados.nome.trim(), dados.cnpj ? normalizarCnpj(dados.cnpj) : null,
      dados.inscricaoEstadual || null, dados.inscricaoMunicipal || null,
      dados.endereco ? JSON.stringify(dados.endereco) : null,
      dados.telefone || null, dados.email || null, dados.principal ? 1 : 0,
    ).lastInsertRowid;
  })();

  auditoria.registrarDaRequisicao(req, { acao: 'filial.criada', entidade: 'filial', entidadeId: resultado });
  return paraApiFilial(buscarFilialLinha(resultado));
}

function atualizarFilial(id, dados, req) {
  const atual = buscarFilialLinha(id);
  if (dados.nome !== undefined && !dados.nome.trim()) throw new ErroApp('Informe o nome da filial.', { codigo: 'entrada_invalida' });
  const cnpj = dados.cnpj !== undefined ? (dados.cnpj ? normalizarCnpj(dados.cnpj) : null) : atual.cnpj;

  emTransacao(() => {
    if (dados.principal) executar('UPDATE filiais SET principal = 0 WHERE empresa_id = ?', atual.empresa_id);
    executar(
      `UPDATE filiais
          SET nome = ?, cnpj = ?, inscricao_estadual = ?, inscricao_municipal = ?, endereco = ?,
              telefone = ?, email = ?, principal = ?, atualizado_em = datetime('now')
        WHERE id = ?`,
      (dados.nome ?? atual.nome).trim(), cnpj,
      dados.inscricaoEstadual !== undefined ? dados.inscricaoEstadual : atual.inscricao_estadual,
      dados.inscricaoMunicipal !== undefined ? dados.inscricaoMunicipal : atual.inscricao_municipal,
      dados.endereco !== undefined ? (dados.endereco ? JSON.stringify(dados.endereco) : null) : atual.endereco,
      dados.telefone !== undefined ? dados.telefone : atual.telefone,
      dados.email !== undefined ? dados.email : atual.email,
      dados.principal ? 1 : atual.principal,
      id,
    );
  })();

  auditoria.registrarDaRequisicao(req, { acao: 'filial.atualizada', entidade: 'filial', entidadeId: id, detalhe: dados });
  return paraApiFilial(buscarFilialLinha(id));
}

function definirFilialAtiva(id, ativa, req) {
  const atual = buscarFilialLinha(id);
  if (!ativa && atual.principal) {
    throw new ErroApp('A filial principal não pode ser desativada.', { codigo: 'filial_principal' });
  }
  executar(`UPDATE filiais SET ativa = ?, atualizado_em = datetime('now') WHERE id = ?`, ativa ? 1 : 0, id);
  auditoria.registrarDaRequisicao(req, {
    acao: ativa ? 'filial.ativada' : 'filial.desativada', entidade: 'filial', entidadeId: id,
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
