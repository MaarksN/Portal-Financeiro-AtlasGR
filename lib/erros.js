'use strict';

const log = require('./log');

// ------------------------------------------------------------------
// Um tipo de erro só, com status HTTP e código estável. O código é o
// que o front usa pra decidir comportamento (ex.: `sessao_expirada`
// manda pro login); a mensagem é o que o usuário lê, em português.
// ------------------------------------------------------------------

class ErroApp extends Error {
  constructor(mensagem, { status = 400, codigo = 'requisicao_invalida', detalhes = null, causa = null } = {}) {
    super(mensagem);
    this.name = 'ErroApp';
    this.status = status;
    this.codigo = codigo;
    this.detalhes = detalhes;
    if (causa) this.cause = causa;
  }
}

const erroDeEntrada = (mensagem, detalhes) => new ErroApp(mensagem, { status: 400, codigo: 'entrada_invalida', detalhes });
const naoAutenticado = (mensagem = 'Sessão expirada. Faça login novamente.') => new ErroApp(mensagem, { status: 401, codigo: 'sessao_expirada' });
const semPermissao = (mensagem = 'Você não tem permissão para esta ação.') => new ErroApp(mensagem, { status: 403, codigo: 'sem_permissao' });
const naoEncontrado = (mensagem = 'Registro não encontrado.') => new ErroApp(mensagem, { status: 404, codigo: 'nao_encontrado' });
const conflito = (mensagem, detalhes) => new ErroApp(mensagem, { status: 409, codigo: 'conflito', detalhes });
const fonteIndisponivel = (mensagem, causa) => new ErroApp(mensagem, { status: 502, codigo: 'fonte_indisponivel', causa });

// Embrulha handler assíncrono pra que rejeição vire `next(erro)` em vez
// de promessa não tratada.
const rota = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function tratadorDeErro(erro, req, res, _next) {
  const status = erro instanceof ErroApp ? erro.status : 500;
  const codigo = erro instanceof ErroApp ? erro.codigo : 'erro_interno';

  const contexto = {
    rota: `${req.method} ${req.originalUrl}`,
    status,
    codigo,
    usuario: req.session?.usuario?.email,
  };

  if (status >= 500) {
    log.erro(erro.message, { ...contexto, pilha: erro.stack });
  } else {
    log.aviso(erro.message, contexto);
  }

  // Detalhe interno nunca vaza pro cliente em erro 500.
  res.status(status).json({
    erro: status >= 500 ? 'Erro interno. A equipe de TI foi notificada.' : erro.message,
    codigo,
    detalhes: erro instanceof ErroApp ? erro.detalhes : null,
  });
}

module.exports = {
  ErroApp,
  erroDeEntrada,
  naoAutenticado,
  semPermissao,
  naoEncontrado,
  conflito,
  fonteIndisponivel,
  rota,
  tratadorDeErro,
};
