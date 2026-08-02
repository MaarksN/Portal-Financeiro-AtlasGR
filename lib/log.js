'use strict';

const config = require('../config');

// Logger mínimo em JSON de uma linha. Em desenvolvimento sai legível;
// em produção sai estruturado, pronto pra qualquer coletor.

const NIVEIS = { debug: 10, info: 20, aviso: 30, erro: 40 };
const nivelMinimo = NIVEIS[process.env.LOG_NIVEL] || (config.producao ? NIVEIS.info : NIVEIS.debug);

const CORES = { debug: '\x1b[90m', info: '\x1b[36m', aviso: '\x1b[33m', erro: '\x1b[31m' };
const RESET = '\x1b[0m';

function emitir(nivel, mensagem, contexto) {
  if (NIVEIS[nivel] < nivelMinimo) return;
  const momento = new Date().toISOString();

  if (config.producao) {
    console.log(JSON.stringify({ momento, nivel, mensagem, ...contexto }));
    return;
  }

  const hora = momento.slice(11, 19);
  const extra = contexto && Object.keys(contexto).length
    ? ' ' + Object.entries(contexto)
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' ')
    : '';
  console.log(`${CORES[nivel]}${hora} ${nivel.padEnd(5)}${RESET} ${mensagem}${extra}`);
}

module.exports = {
  debug: (mensagem, contexto) => emitir('debug', mensagem, contexto),
  info: (mensagem, contexto) => emitir('info', mensagem, contexto),
  aviso: (mensagem, contexto) => emitir('aviso', mensagem, contexto),
  erro: (mensagem, contexto) => emitir('erro', mensagem, contexto),
};
