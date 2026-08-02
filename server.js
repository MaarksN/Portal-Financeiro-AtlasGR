'use strict';

const path = require('path');
const express = require('express');
const session = require('express-session');

const config = require('./config');
const log = require('./lib/log');
require('./db/index');
const { semear } = require('./db/seed');
const { LojaDeSessaoSqlite } = require('./lib/sessao-store');
const { cabecalhos, csrf } = require('./lib/seguranca');
const { tratadorDeErro, ErroApp } = require('./lib/erros');
const conectores = require('./lib/conectores');
const espelho = require('./lib/espelho');
const rotas = require('./rotas');

semear();

const app = express();

// Atrás de proxy reverso, o rate limit e o cookie secure precisam do
// IP e do protocolo reais.
if (config.atrasDeProxy) app.set('trust proxy', 1);

app.disable('x-powered-by');
app.use(cabecalhos);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.use(session({
  name: 'atlas.sid',
  secret: config.segredoSessao,
  store: new LojaDeSessaoSqlite(),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.producao,
    maxAge: config.duracaoSessaoMs,
  },
}));

// CSRF só onde há efeito colateral. A landing page continua sem
// sessão para quem nunca fez login.
app.use(['/login', '/logout', '/api'], csrf);

// O app protegido não é servido pelo estático — sem sessão, vai pro login.
app.get('/portal.html', (req, res, next) => {
  if (!req.session?.usuario) return res.redirect('/login.html');
  return next();
});

app.use(express.static(config.caminhos.publico, {
  etag: true,
  maxAge: config.producao ? '1h' : 0,
}));

app.use(rotas);

// 404 de API responde JSON; qualquer outra coisa cai na landing.
app.use('/api', (req, res, next) => next(new ErroApp('Rota não encontrada.', { status: 404, codigo: 'nao_encontrado' })));
app.use((req, res) => res.sendFile(path.join(config.caminhos.publico, 'index.html')));

app.use(tratadorDeErro);

// ------------------------------------------------------------------
// Job de fundo: puxa as fontes de cobrança, drena a fila do espelho e
// reconcilia os chamados abertos com o Jira. Roda uma vez no boot
// (fora do modo demo) e depois no intervalo configurado.
// ------------------------------------------------------------------
async function ciclo() {
  try {
    const cobrancas = await conectores.sincronizarTudo();
    const fila = await espelho.processarFila();
    const reconciliacao = await espelho.reconciliar();
    log.info('Ciclo de sincronização concluído', {
      fontes: cobrancas.fontes.filter((f) => !f.pulado).length,
      espelhoEnviados: fila.enviados || 0,
      chamadosMudados: reconciliacao.mudados || 0,
    });
  } catch (erro) {
    log.erro('Ciclo de sincronização falhou', { erro: erro.message });
  }
}

function agendarSincronizacao() {
  const minutos = config.sincronizacao.intervaloMinutos;
  if (!minutos) {
    log.info('Sincronização automática desligada', { motivo: config.demo ? 'modo demonstração' : 'SINCRONIZACAO_MINUTOS=0' });
    return;
  }
  ciclo();
  const temporizador = setInterval(ciclo, minutos * 60 * 1000);
  if (temporizador.unref) temporizador.unref();
  log.info('Sincronização automática agendada', { minutos });
}

const servidor = app.listen(config.porta, () => {
  log.info(`Central Atlas GR no ar em http://localhost:${config.porta}`, {
    ambiente: config.ambiente,
    modoDemo: config.demo,
    jira: config.jira.configurado,
    bitrix: config.bitrix.configurado,
  });
  if (config.demo) {
    log.aviso('Modo demonstração: dados semeados localmente, nenhuma fonte externa configurada.');
  }
  agendarSincronizacao();
});

const encerrar = (sinal) => {
  log.info('Encerrando', { sinal });
  servidor.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};

process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('SIGINT', () => encerrar('SIGINT'));
process.on('unhandledRejection', (motivo) => log.erro('Promessa rejeitada sem tratamento', { motivo: String(motivo) }));

module.exports = app;
