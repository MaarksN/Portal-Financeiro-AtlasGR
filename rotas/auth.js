'use strict';

const express = require('express');
const { z } = require('zod');

const config = require('../config');
const usuarios = require('../lib/usuarios');
const { rota } = require('../lib/erros');
const { garantirTokenCsrf, limiteLogin, exigirSessao } = require('../lib/seguranca');
const { validarCorpo } = require('./comum');

const router = express.Router();

const esquemaLogin = z.object({
  email: z.string().trim().min(1, 'Informe o e-mail.'),
  senha: z.string().min(1, 'Informe a senha.'),
});

router.post('/login', limiteLogin, validarCorpo(esquemaLogin), rota(async (req, res) => {
  const usuario = usuarios.verificarLogin(req.dados.email, req.dados.senha, { ip: req.ip });

  // Sessão nova a cada login — fecha a porta para fixação de sessão.
  await new Promise((resolve, reject) => {
    req.session.regenerate((erro) => (erro ? reject(erro) : resolve()));
  });

  req.session.usuario = usuario;
  const csrf = garantirTokenCsrf(req.session);

  await new Promise((resolve, reject) => {
    req.session.save((erro) => (erro ? reject(erro) : resolve()));
  });

  res.json({ ok: true, usuario, csrf });
}));

router.post('/logout', (req, res) => {
  if (!req.session) return res.json({ ok: true });
  return req.session.destroy(() => {
    res.clearCookie('atlas.sid');
    res.json({ ok: true });
  });
});

// Estado da sessão + token CSRF + o que este usuário pode ver. O front
// monta o menu a partir daqui, então tudo que a UI precisa saber sobre
// permissão sai de um lugar só.
router.get('/api/sessao', (req, res) => {
  const csrf = garantirTokenCsrf(req.session);
  const usuario = req.session.usuario || null;

  res.json({
    autenticado: Boolean(usuario),
    usuario,
    csrf,
    modoDemo: config.demo,
    permissoes: usuario ? {
      aprovaReembolso: usuarios.temPapel(usuario, 'coordenacao', 'gerencia', 'diretoria'),
      financeiro: usuarios.temPapel(usuario, 'financeiro'),
      comercial: usuarios.temPapel(usuario, 'comercial'),
      ti: usuarios.temPapel(usuario, 'ti'),
      admin: usuarios.temPapel(usuario, 'admin'),
    } : null,
    integracoes: {
      bitrix: config.bitrix.configurado,
      integracao: config.integracao.configurado,
      ia: config.ia.configurado,
      emissaoBoleto: config.sicredi.configurado,
    },
  });
});

router.get('/api/quem-sou-eu', exigirSessao, (req, res) => res.json(req.session.usuario));

router.get('/api/usuarios', exigirSessao, (req, res) => {
  res.json(usuarios.listar().map((u) => ({ email: u.email, nome: u.nome, papeis: u.papeis })));
});

module.exports = router;
