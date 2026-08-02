'use strict';

const bcrypt = require('bcryptjs');

const { consultar, consultarUm, executar, lerJson } = require('../db');
const { ErroApp } = require('./erros');
const auditoria = require('./auditoria');

// ------------------------------------------------------------------
// Papéis. `solicitante` todo mundo tem; os demais habilitam telas e
// ações específicas. A cadeia de alçada do reembolso usa exatamente
// os papéis coordenacao/gerencia/diretoria.
// ------------------------------------------------------------------
const PAPEIS = Object.freeze({
  solicitante: 'Solicitante',
  coordenacao: 'Coordenação',
  gerencia: 'Gerência',
  diretoria: 'Diretoria',
  financeiro: 'Financeiro',
  ti: 'TI',
  vendedor: 'Vendedor',
  gestor_comercial: 'Gestor Comercial',
  admin: 'Administrador',
});

const MAX_TENTATIVAS = 5;
const BLOQUEIO_MINUTOS = 15;

function paraSessao(linha) {
  return {
    id: linha.id,
    email: linha.email,
    nome: linha.nome,
    papeis: lerJson(linha.papeis, []),
    centroCusto: linha.centro_custo,
    gestorEmail: linha.gestor_email,
  };
}

function porEmail(email) {
  return consultarUm('SELECT * FROM usuarios WHERE lower(email) = lower(?)', String(email || '').trim());
}

function listar() {
  return consultar('SELECT * FROM usuarios WHERE ativo = 1 ORDER BY nome').map(paraSessao);
}

function listarPorPapel(papel) {
  // O papel vive num array JSON; o LIKE resolve sem precisar de tabela
  // de junção para um portal deste tamanho.
  return consultar(
    `SELECT * FROM usuarios WHERE ativo = 1 AND papeis LIKE ? ORDER BY nome`,
    `%"${papel}"%`,
  ).map(paraSessao);
}

function temPapel(usuario, ...papeis) {
  if (!usuario) return false;
  const meus = usuario.papeis || [];
  if (meus.includes('admin')) return true;
  return papeis.some((papel) => meus.includes(papel));
}

// ------------------------------------------------------------------
// Login. Conta tentativa falha e bloqueia temporariamente — o rate
// limit por IP não cobre ataque distribuído contra uma conta só.
// ------------------------------------------------------------------
function verificarLogin(email, senha, { ip } = {}) {
  const linha = porEmail(email);

  // Custo constante: mesmo sem usuário, gastamos um compare para não
  // vazar quais e-mails existem pelo tempo de resposta.
  if (!linha) {
    bcrypt.compareSync(String(senha || ''), '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
    throw new ErroApp('E-mail ou senha incorretos.', { status: 401, codigo: 'credencial_invalida' });
  }

  if (!linha.ativo) {
    throw new ErroApp('Este acesso está desativado. Fale com o TI.', { status: 403, codigo: 'usuario_inativo' });
  }

  if (linha.bloqueado_ate && new Date(linha.bloqueado_ate) > new Date()) {
    const minutos = Math.max(1, Math.ceil((new Date(linha.bloqueado_ate) - new Date()) / 60000));
    throw new ErroApp(
      `Muitas tentativas. Tente de novo em ${minutos} minuto${minutos > 1 ? 's' : ''}.`,
      { status: 429, codigo: 'conta_bloqueada' },
    );
  }

  if (!bcrypt.compareSync(String(senha || ''), linha.senha_hash)) {
    const tentativas = linha.tentativas_falhas + 1;
    const bloquear = tentativas >= MAX_TENTATIVAS;
    executar(
      `UPDATE usuarios
          SET tentativas_falhas = ?,
              bloqueado_ate = ?,
              atualizado_em = datetime('now')
        WHERE id = ?`,
      bloquear ? 0 : tentativas,
      bloquear ? new Date(Date.now() + BLOQUEIO_MINUTOS * 60000).toISOString() : linha.bloqueado_ate,
      linha.id,
    );
    auditoria.registrar({
      ator: linha.email,
      acao: bloquear ? 'login.bloqueado' : 'login.falhou',
      entidade: 'usuario',
      entidadeId: linha.id,
      detalhe: { tentativas },
      ip,
    });
    throw new ErroApp('E-mail ou senha incorretos.', { status: 401, codigo: 'credencial_invalida' });
  }

  executar(
    `UPDATE usuarios
        SET tentativas_falhas = 0,
            bloqueado_ate = NULL,
            ultimo_acesso_em = datetime('now'),
            atualizado_em = datetime('now')
      WHERE id = ?`,
    linha.id,
  );
  auditoria.registrar({ ator: linha.email, acao: 'login.ok', entidade: 'usuario', entidadeId: linha.id, ip });

  return paraSessao(linha);
}

function criar({ email, nome, senha, papeis = ['solicitante'], centroCusto = null, gestorEmail = null }) {
  const existente = porEmail(email);
  if (existente) throw new ErroApp('Já existe um usuário com este e-mail.', { status: 409, codigo: 'conflito' });

  const resultado = executar(
    `INSERT INTO usuarios (email, nome, senha_hash, papeis, centro_custo, gestor_email)
     VALUES (?, ?, ?, ?, ?, ?)`,
    String(email).trim().toLowerCase(),
    nome,
    bcrypt.hashSync(senha, 10),
    JSON.stringify(papeis),
    centroCusto,
    gestorEmail,
  );
  return consultarUm('SELECT * FROM usuarios WHERE id = ?', resultado.lastInsertRowid);
}

module.exports = {
  PAPEIS,
  paraSessao,
  porEmail,
  listar,
  listarPorPapel,
  temPapel,
  verificarLogin,
  criar,
};
