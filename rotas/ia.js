'use strict';

const express = require('express');
const { z } = require('zod');

const ia = require('../lib/ia');
const usuarios = require('../lib/usuarios');
const { rota } = require('../lib/erros');
const { validarCorpo } = require('./comum');

const router = express.Router();

// Mesmas regras de permissão da navegação (ver app.js) — o assistente
// não é uma porta lateral para dado que a tela não mostraria.
function permissoesDe(usuario) {
  return {
    financeiro: usuarios.temPapel(usuario, 'financeiro'),
    admin: usuarios.temPapel(usuario, 'admin'),
  };
}

const esquemaPergunta = z.object({
  pergunta: z.string().trim().min(3, 'Escreva a pergunta com um pouco mais de detalhe.').max(5000),
});

router.post('/perguntar', validarCorpo(esquemaPergunta), rota(async (req, res) => {
  const resultado = await ia.perguntar({
    pergunta: req.dados.pergunta,
    usuario: req.session.usuario,
    permissoes: permissoesDe(req.session.usuario),
  });
  res.json(resultado);
}));

module.exports = router;
