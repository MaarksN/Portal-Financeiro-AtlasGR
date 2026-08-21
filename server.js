'use strict';
console.log('HELLO FROM SERVER.JS');
require('./lib/observability');

const express = require('express');
const session = require('express-session');

const config = require('./config');
const log = require('./lib/log');
const { httpLogger } = require('./lib/logger');
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
if (config.core.atrasDeProxy) app.set('trust proxy', 1);

app.disable('x-powered-by');
app.use(cabecalhos);
app.use(httpLogger);
app.use(express.json({ limit: '1mb' }));

app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'portal-financeiro-atlasgr' }));

app.use(session({
  name: 'atlas.sid',
  secret: config.core.segredoSessao,
  store: new LojaDeSessaoSqlite(),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: config.core.producao,
    maxAge: 8 * 60 * 60 * 1000,
    sameSite: 'lax',
  },
}));



// CSRF só onde há efeito colateral. A landing page continua sem
// sessão para quem nunca fez login.
app.use(['/login', '/logout', '/api'], csrf);

// Não há landing pública — '/' e qualquer rota desconhecida caem
// direto no login ou no app, conforme sessão.
app.get('/', (req, res) => res.redirect(req.session?.usuario ? '/portal.html' : '/login.html'));

// O app protegido não é servido pelo estático — sem sessão, vai pro login.
app.get('/portal.html', (req, res, next) => {
  if (!req.session?.usuario) return res.redirect('/login.html');
  return next();
});

app.use(express.static(config.core.caminhos.publico, {
  etag: true,
  maxAge: config.core.producao ? '1h' : 0,
}));

app.use(rotas);

// 404 de API responde JSON; qualquer outra rota desconhecida volta pra '/'.
app.use('/api', (req, res, next) => next(new ErroApp('Rota não encontrada.', { status: 404, codigo: 'nao_encontrado' })));
app.use((req, res) => res.redirect('/'));

app.use(tratadorDeErro);

// ------------------------------------------------------------------
// Job de fundo: puxa as fontes de cobrança e drena a fila do espelho.
// Roda uma vez no boot (fora do modo demo) e depois no intervalo
// configurado.
// ------------------------------------------------------------------
async function ciclo() {
  try {
    const cobrancas = await conectores.sincronizarTudo();
    const fila = await espelho.processarFila();
    log.info('Ciclo de sincronização concluído', {
      fontes: cobrancas.fontes.filter((f) => !f.pulado).length,
      espelhoEnviados: fila.enviados || 0,
    });
  } catch (erro) {
    log.erro('Ciclo de sincronização falhou', { erro: erro.message });
  }
}

function agendarSincronizacao() {
  const minutos = config.sincronizacao.intervaloMinutos;
  if (!minutos) {
    log.info('Sincronização automática desligada', { motivo: 'SINCRONIZACAO_MINUTOS=0' });
    return;
  }
  ciclo();
  const temporizador = setInterval(ciclo, minutos * 60 * 1000);
  if (temporizador.unref) temporizador.unref();
  log.info('Sincronização automática agendada', { minutos });
}

function iniciar() {
  const servidor = app.listen(config.core.porta, () => {
    log.info(`AtlasGR Financeiro no ar em http://localhost:${config.core.porta}`, {
      ambiente: config.core.ambiente,
      bitrix: config.bitrix.configurado,
    });
    agendarSincronizacao();
  });

  const encerrar = (sinal) => {
    log.info('Encerrando', { sinal });
    servidor.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on('SIGTERM', () => encerrar('SIGTERM'));
  process.on('SIGINT', () => encerrar('SIGINT'));
  return servidor;
}

process.on('unhandledRejection', (motivo) => log.erro('Promessa rejeitada sem tratamento', { motivo: String(motivo) }));

if (require.main === module) {
  try {
    iniciar();
  } catch (err) {
    console.error("ERRO SYNCHRONOUS:", err);
  }
}


module.exports = app;

