'use strict';

const { consultar, consultarUm, executar } = require('../db');
const config = require('../config');
const log = require('./log');
const integracao = require('./integracao');
const jira = require('./jira');

// ------------------------------------------------------------------
// Espelho Jira -> Bitrix.
//
// Um caminho só, de propósito: o Jira é dono do ciclo de vida do
// chamado e o card do Bitrix é um reflexo. Nada volta do Bitrix para
// o Jira. Isso elimina o problema clássico de dois escritores
// brigando pelo mesmo status — a visão unificada no CRM sai de graça,
// e o custo é apenas o atraso da fila (segundos).
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

// ------------------------------------------------------------------
// Espelhar um chamado: abertura e cada mudança relevante viram evento.
// A chave de idempotência inclui o estado, para que uma mudança nova
// gere um evento novo mas um reprocessamento da mesma mudança não.
// ------------------------------------------------------------------
function espelharChamado(chamado, { evento = 'chamado.atualizado' } = {}) {
  const chaveIdem = evento === 'chamado.aberto'
    ? chamado.protocolo
    : `${chamado.protocolo}:${chamado.status}:${chamado.responsavel || '-'}`;

  enfileirar(evento, chaveIdem, {
    protocolo: chamado.protocolo,
    chaveJira: chamado.chave_jira,
    urlJira: chamado.url_jira,
    categoria: chamado.categoria,
    prioridade: chamado.prioridade,
    resumo: chamado.resumo,
    descricao: chamado.descricao,
    status: chamado.status,
    statusCategoria: chamado.status_categoria,
    responsavel: chamado.responsavel,
    slaVenceEm: chamado.sla_vence_em,
    slaViolado: Boolean(chamado.sla_violado),
    solicitanteEmail: chamado.solicitante_email,
    canal: 'portal-interno',
    entityTypeId: config.bitrix.entidadeChamado || undefined,
  });
}

// ------------------------------------------------------------------
// Reconciliação: relê o Jira para os chamados ainda abertos, atualiza
// o espelho local e reemite evento só para o que realmente mudou.
// É o que fecha a janela entre "o Jira mudou" e "o card do Bitrix
// sabe" sem precisar de webhook de saída do Jira.
// ------------------------------------------------------------------
async function reconciliar() {
  if (!jira.configurado()) {
    return { pulado: true, motivo: 'Jira não configurado' };
  }

  const abertos = consultar(
    `SELECT * FROM chamados
      WHERE chave_jira IS NOT NULL
        AND (status_categoria IS NULL OR status_categoria <> 'concluido')
      ORDER BY atualizado_em ASC
      LIMIT 100`,
  );
  if (!abertos.length) return { verificados: 0, mudados: 0 };

  const daFila = await jira.listarDaFila({ limite: 100 });
  const porChave = new Map(daFila.map((issue) => [issue.chave, issue]));

  let mudados = 0;

  for (const chamado of abertos) {
    let issue = porChave.get(chamado.chave_jira);
    if (!issue) {
      // Saiu da janela da busca (fila grande ou já fechado) — busca direta.
      try {
        issue = await jira.obter(chamado.chave_jira);
      } catch (erro) {
        log.aviso('Não foi possível reler chamado no Jira', { chave: chamado.chave_jira, erro: erro.message });
        continue;
      }
    }

    const mudou = issue.status !== chamado.status
      || issue.statusCategoria !== chamado.status_categoria
      || (issue.responsavel || null) !== (chamado.responsavel || null)
      || Boolean(issue.slaViolado) !== Boolean(chamado.sla_violado);

    executar(
      `UPDATE chamados
          SET status = ?, status_categoria = ?, responsavel = ?,
              sla_vence_em = ?, sla_violado = ?,
              sincronizado_em = datetime('now'), atualizado_em = datetime('now')
        WHERE id = ?`,
      issue.status,
      issue.statusCategoria,
      issue.responsavel,
      issue.slaVenceEm,
      issue.slaViolado ? 1 : 0,
      chamado.id,
    );

    if (mudou) {
      mudados += 1;
      espelharChamado(consultarUm('SELECT * FROM chamados WHERE id = ?', chamado.id));
    }
  }

  return { verificados: abertos.length, mudados };
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
  espelharChamado,
  reconciliar,
  situacaoDaFila,
};
