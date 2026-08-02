'use strict';

const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const config = require('../config');
const { naoAutenticado, semPermissao, ErroApp } = require('./erros');
const { temPapel } = require('./usuarios');

// ------------------------------------------------------------------
// Cabeçalhos. A CSP libera o Google Fonts (única origem externa que o
// portal usa) e nada mais. `unsafe-inline` em style é necessário
// porque o front escreve estilo inline em barras de progresso e
// alturas de coluna do funil; script fica sem inline nenhum.
// ------------------------------------------------------------------
const cabecalhos = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: config.producao ? [] : null,
    },
  },
  // O portal serve PDF/imagem de comprovante para a própria origem.
  crossOriginResourcePolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'same-origin' },
});

// ------------------------------- Limites -------------------------------
const limiteLogin = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas de login deste endereço. Aguarde alguns minutos.', codigo: 'muitas_tentativas' },
});

const limiteApi = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { erro: 'Muitas requisições. Aguarde um instante.', codigo: 'muitas_requisicoes' },
});

// --------------------------------- CSRF ---------------------------------
// Token sincronizador: nasce na sessão, o front lê em GET /api/sessao e
// devolve no cabeçalho X-CSRF-Token. Como a política de mesma origem
// impede outro site de ler nossa resposta JSON, o token não vaza.

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

function garantirTokenCsrf(sessao) {
  if (!sessao.csrf) sessao.csrf = crypto.randomBytes(32).toString('hex');
  return sessao.csrf;
}

function csrf(req, res, next) {
  if (!req.session) return next();
  const esperado = garantirTokenCsrf(req.session);
  if (METODOS_SEGUROS.has(req.method)) return next();

  const recebido = req.get('X-CSRF-Token') || req.body?.csrf;
  const bufferRecebido = Buffer.from(typeof recebido === 'string' ? recebido : '', 'utf8');
  const bufferEsperado = Buffer.from(esperado, 'utf8');
  // timingSafeEqual lança quando os tamanhos diferem — checar antes.
  const iguais = bufferRecebido.length === bufferEsperado.length
    && crypto.timingSafeEqual(bufferRecebido, bufferEsperado);

  if (!iguais) {
    return next(new ErroApp('Token de segurança inválido. Recarregue a página.', {
      status: 403,
      codigo: 'csrf_invalido',
    }));
  }
  return next();
}

// ------------------------------ Permissões ------------------------------
function exigirSessao(req, res, next) {
  if (!req.session?.usuario) return next(naoAutenticado());
  return next();
}

// Aceita a ação se o usuário tiver QUALQUER um dos papéis. `admin`
// passa sempre (ver temPapel).
function exigirPapel(...papeis) {
  return (req, res, next) => {
    if (!req.session?.usuario) return next(naoAutenticado());
    if (!temPapel(req.session.usuario, ...papeis)) {
      return next(semPermissao(`Esta ação exige o perfil: ${papeis.join(' ou ')}.`));
    }
    return next();
  };
}

module.exports = {
  cabecalhos,
  limiteLogin,
  limiteApi,
  csrf,
  garantirTokenCsrf,
  exigirSessao,
  exigirPapel,
};
