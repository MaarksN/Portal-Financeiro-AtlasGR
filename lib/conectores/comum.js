'use strict';

const { paraCentavos } = require('../dinheiro');

// ------------------------------------------------------------------
// Utilidades de normalização compartilhadas pelos conectores. Cada
// sistema de origem nomeia os campos do seu jeito; aqui a gente
// aceita uma lista de nomes candidatos e devolve o primeiro que
// existir, para o adaptador ficar declarativo.
// ------------------------------------------------------------------

function primeiroPreenchido(registro, candidatos) {
  for (const chave of candidatos) {
    const valor = registro?.[chave];
    if (valor !== undefined && valor !== null && String(valor).trim() !== '') return valor;
  }
  return null;
}

// Aceita "2026-08-02", "2026-08-02T10:00:00Z", "02/08/2026" e
// "02-08-2026". Devolve sempre YYYY-MM-DD, ou null.
function paraDataIso(valor) {
  if (!valor) return null;
  const texto = String(valor).trim();

  const jaIso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (jaIso) return `${jaIso[1]}-${jaIso[2]}-${jaIso[3]}`;

  const brasileiro = texto.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (brasileiro) return `${brasileiro[3]}-${brasileiro[2]}-${brasileiro[1]}`;

  const data = new Date(texto);
  return Number.isNaN(data.getTime()) ? null : data.toISOString().slice(0, 10);
}

function paraCentavosSeguro(valor, padrao = 0) {
  if (valor === null || valor === undefined || String(valor).trim() === '') return padrao;
  try {
    return paraCentavos(valor);
  } catch {
    return padrao;
  }
}

// Uma cobrança normalizada. Todo conector devolve exatamente isto —
// é o contrato que a tabela `cobrancas` espera.
function montarCobranca(origem, dados) {
  const vencimento = paraDataIso(dados.vencimento);
  if (!dados.idExterno || !vencimento) return null;

  return {
    origem,
    idExterno: String(dados.idExterno),
    documento: dados.documento ? String(dados.documento) : null,
    clienteNome: String(dados.clienteNome || 'Cliente não identificado').trim(),
    clienteDoc: dados.clienteDoc ? String(dados.clienteDoc) : null,
    clienteIdExterno: dados.clienteIdExterno ? String(dados.clienteIdExterno) : null,
    valorCentavos: paraCentavosSeguro(dados.valor),
    valorPagoCentavos: paraCentavosSeguro(dados.valorPago),
    emissao: paraDataIso(dados.emissao),
    vencimento,
    pagamento: paraDataIso(dados.pagamento),
    statusOrigem: dados.statusOrigem ? String(dados.statusOrigem) : null,
    urlOrigem: dados.urlOrigem || null,
  };
}

// Muitos endpoints legados embrulham o array de formas diferentes.
function extrairLista(corpo) {
  if (Array.isArray(corpo)) return corpo;
  for (const chave of ['dados', 'data', 'items', 'itens', 'result', 'registros', 'rows', 'records']) {
    const valor = corpo?.[chave];
    if (Array.isArray(valor)) return valor;
    if (Array.isArray(valor?.items)) return valor.items;
  }
  return [];
}

module.exports = {
  primeiroPreenchido,
  paraDataIso,
  paraCentavosSeguro,
  montarCobranca,
  extrairLista,
};
