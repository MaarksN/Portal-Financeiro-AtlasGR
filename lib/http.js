'use strict';

const log = require('./log');
const { fonteIndisponivel } = require('./erros');

// ------------------------------------------------------------------
// fetch com timeout, retry e backoff. Toda chamada a sistema de
// terceiro (Jira, Bitrix, Connect Plus, Perfil Securitário, serviço
// de integração) passa por aqui — é o único lugar que precisa saber
// o que é erro transitório.
// ------------------------------------------------------------------

const TRANSITORIOS = new Set([408, 425, 429, 500, 502, 503, 504]);

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function atrasoDe(resposta, tentativa) {
  const cabecalho = resposta?.headers?.get?.('retry-after');
  if (cabecalho) {
    const segundos = Number(cabecalho);
    if (Number.isFinite(segundos)) return Math.min(segundos * 1000, 30000);
  }
  // Backoff exponencial com jitter, teto de 8s.
  return Math.min(2 ** tentativa * 400, 8000) + Math.floor(Math.random() * 250);
}

async function requisitar(url, {
  metodo = 'GET',
  cabecalhos = {},
  corpo = null,
  timeoutMs = 15000,
  tentativas = 3,
  rotulo = 'externo',
} = {}) {
  let ultimoErro = null;

  for (let tentativa = 0; tentativa < tentativas; tentativa += 1) {
    const abortar = new AbortController();
    const relogio = setTimeout(() => abortar.abort(), timeoutMs);

    try {
      const resposta = await fetch(url, {
        method: metodo,
        headers: corpo && !cabecalhos['Content-Type']
          ? { 'Content-Type': 'application/json', ...cabecalhos }
          : cabecalhos,
        body: corpo === null ? undefined : (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)),
        signal: abortar.signal,
      });
      clearTimeout(relogio);

      if (TRANSITORIOS.has(resposta.status) && tentativa < tentativas - 1) {
        const atraso = atrasoDe(resposta, tentativa);
        log.aviso('Resposta transitória — repetindo', { rotulo, status: resposta.status, atraso, tentativa: tentativa + 1 });
        await esperar(atraso);
        continue;
      }

      return resposta;
    } catch (erro) {
      clearTimeout(relogio);
      ultimoErro = erro;
      const abortado = erro.name === 'AbortError';

      if (tentativa < tentativas - 1) {
        const atraso = atrasoDe(null, tentativa);
        log.aviso('Falha de rede — repetindo', {
          rotulo,
          erro: abortado ? `timeout de ${timeoutMs}ms` : erro.message,
          atraso,
          tentativa: tentativa + 1,
        });
        await esperar(atraso);
        continue;
      }

      throw fonteIndisponivel(
        abortado
          ? `${rotulo} não respondeu dentro de ${Math.round(timeoutMs / 1000)}s.`
          : `Não foi possível falar com ${rotulo}: ${erro.message}`,
        erro,
      );
    }
  }

  throw fonteIndisponivel(`Não foi possível falar com ${rotulo}.`, ultimoErro);
}

// Variante que já valida o status e devolve o JSON. `extrairErro`
// permite cada integração traduzir o corpo de erro do seu jeito.
async function json(url, opcoes = {}) {
  const { rotulo = 'externo', extrairErro } = opcoes;
  const resposta = await requisitar(url, opcoes);

  const texto = await resposta.text();
  let corpo = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = null;
  }

  if (!resposta.ok) {
    const mensagem = (extrairErro && extrairErro(corpo, resposta))
      || corpo?.erro
      || corpo?.message
      || `${rotulo} respondeu ${resposta.status}`;
    throw fonteIndisponivel(mensagem);
  }

  return corpo;
}

module.exports = { requisitar, json };
