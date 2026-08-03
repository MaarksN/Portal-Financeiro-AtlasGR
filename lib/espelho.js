'use strict';

const { consultar, consultarUm, executar } = require('../db');
const log = require('./log');
const integracao = require('./integracao');

// ------------------------------------------------------------------
// Fila de espelhamento para o serviço de integração (Bitrix etc.).
//
// A fila é persistida em SQLite: se o serviço de integração estiver
// fora do ar, o evento espera e é reenviado com backoff. A chave de
// idempotência garante que reenviar não duplica card.
// ------------------------------------------------------------------

const MAX_TENTATIVAS = 8;

const proximoAtraso = (tentativas) => Math.min(2 ** tentativas * 30, 3600) * 1000; // 1min → 1h

function enfileirar(evento, chaveIdem, dados) {
  executar(
    `INSERT INTO espelho_fila (chave_idem, evento, dados, estado, proxima_tentativa_em)
     VALUES (?, ?, ?, 'pendente', datetime('now'))
     ON CONFLICT (chave_idem) DO UPDATE SET
       dados = excluded.dados,
       evento = excluded.evento,
       estado = 'pendente',
       proxima_tentativa_em = datetime('now'),
       atualizado_em = datetime('now')`,
    chaveIdem,
    evento,
    JSON.stringify(dados),
  );
  log.debug('Evento enfileirado para o espelho', { evento, chaveIdem });
}

// Processa o que está vencido na fila. Devolve o que aconteceu para
// o job de sincronização registrar.
async function processarFila({ lote = 25 } = {}) {
  if (!integracao.configurado()) {
    return { pulado: true, motivo: 'serviço de integração não configurado' };
  }

  const pendentes = consultar(
    `SELECT * FROM espelho_fila
      WHERE estado = 'pendente'
        AND (proxima_tentativa_em IS NULL OR proxima_tentativa_em <= datetime('now'))
      ORDER BY id
      LIMIT ?`,
    lote,
  );

  let enviados = 0;
  let falhas = 0;

  for (const item of pendentes) {
    try {
      await integracao.dispararEvento(item.evento, item.chave_idem, JSON.parse(item.dados));
      executar(
        `UPDATE espelho_fila
            SET estado = 'enviado', ultimo_erro = NULL, atualizado_em = datetime('now')
          WHERE id = ?`,
        item.id,
      );
      enviados += 1;
    } catch (erro) {
      const tentativas = item.tentativas + 1;
      const desistir = tentativas >= MAX_TENTATIVAS;
      executar(
        `UPDATE espelho_fila
            SET tentativas = ?,
                estado = ?,
                ultimo_erro = ?,
                proxima_tentativa_em = datetime('now', ?),
                atualizado_em = datetime('now')
          WHERE id = ?`,
        tentativas,
        desistir ? 'falhou' : 'pendente',
        erro.message,
        `+${Math.round(proximoAtraso(tentativas) / 1000)} seconds`,
        item.id,
      );
      falhas += 1;
      log[desistir ? 'erro' : 'aviso'](
        desistir ? 'Evento do espelho desistiu após esgotar tentativas' : 'Evento do espelho falhou — vai repetir',
        { evento: item.evento, chaveIdem: item.chave_idem, tentativas, erro: erro.message },
      );
    }
  }

  return { pendentes: pendentes.length, enviados, falhas };
}

function situacaoDaFila() {
  const linhas = consultar(
    `SELECT estado, count(*) AS total FROM espelho_fila GROUP BY estado`,
  );
  const porEstado = Object.fromEntries(linhas.map((l) => [l.estado, l.total]));
  return {
    pendentes: porEstado.pendente || 0,
    enviados: porEstado.enviado || 0,
    falhados: porEstado.falhou || 0,
    ultimoErro: consultarUm(
      `SELECT ultimo_erro, atualizado_em FROM espelho_fila
        WHERE ultimo_erro IS NOT NULL ORDER BY atualizado_em DESC LIMIT 1`,
    ) || null,
  };
}

module.exports = {
  enfileirar,
  processarFila,
  situacaoDaFila,
};
