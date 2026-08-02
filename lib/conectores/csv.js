'use strict';

const { montarCobranca, primeiroPreenchido } = require('./comum');
const { CANDIDATOS } = require('./rest-generico');
const { ErroApp } = require('../erros');

// ------------------------------------------------------------------
// Importação manual por CSV. É a saída que funciona hoje, sem
// depender de credencial de API: o financeiro exporta a carteira do
// Connect Plus (ou de qualquer sistema) e sobe o arquivo aqui.
//
// Aceita separador `;` (padrão do Excel em pt-BR) ou `,`, detectado
// pela primeira linha.
// ------------------------------------------------------------------

function detectarSeparador(cabecalho) {
  const pontoEVirgula = (cabecalho.match(/;/g) || []).length;
  const virgula = (cabecalho.match(/,/g) || []).length;
  return pontoEVirgula >= virgula ? ';' : ',';
}

// Divisor que respeita aspas — razão social costuma ter vírgula.
function dividirLinha(linha, separador) {
  const celulas = [];
  let atual = '';
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i += 1) {
    const caractere = linha[i];
    if (caractere === '"') {
      if (dentroDeAspas && linha[i + 1] === '"') {
        atual += '"';
        i += 1;
      } else {
        dentroDeAspas = !dentroDeAspas;
      }
    } else if (caractere === separador && !dentroDeAspas) {
      celulas.push(atual.trim());
      atual = '';
    } else {
      atual += caractere;
    }
  }
  celulas.push(atual.trim());
  return celulas;
}

const normalizarCabecalho = (texto) => texto
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')   // tira acento: "situação" -> "situacao"
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_|_$/g, '');

function analisar(conteudo) {
  const linhas = String(conteudo)
    .replace(/^﻿/, '')      // BOM que o Excel escreve
    .split(/\r?\n/)
    .filter((linha) => linha.trim() !== '');

  if (linhas.length < 2) {
    throw new ErroApp('O arquivo precisa ter cabeçalho e ao menos uma linha de dados.', {
      codigo: 'csv_invalido',
    });
  }

  const separador = detectarSeparador(linhas[0]);
  const cabecalho = dividirLinha(linhas[0], separador).map(normalizarCabecalho);

  const obrigatorios = ['vencimento', 'valor'];
  const faltando = obrigatorios.filter((campo) => !cabecalho.some((c) => c.includes(campo)));
  if (faltando.length) {
    throw new ErroApp(
      `O CSV precisa ter as colunas: ${faltando.join(', ')}. Colunas encontradas: ${cabecalho.join(', ')}.`,
      { codigo: 'csv_invalido' },
    );
  }

  const cobrancas = [];
  const ignoradas = [];

  linhas.slice(1).forEach((linha, indice) => {
    const celulas = dividirLinha(linha, separador);
    const registro = Object.fromEntries(cabecalho.map((chave, i) => [chave, celulas[i] ?? '']));

    const cobranca = montarCobranca('csv', {
      // Sem id na planilha, a chave estável é documento+vencimento —
      // reimportar o mesmo arquivo atualiza em vez de duplicar.
      idExterno: primeiroPreenchido(registro, CANDIDATOS.idExterno)
        || `${primeiroPreenchido(registro, CANDIDATOS.documento) || `L${indice + 2}`}-${primeiroPreenchido(registro, CANDIDATOS.vencimento) || ''}`,
      documento: primeiroPreenchido(registro, CANDIDATOS.documento),
      clienteNome: primeiroPreenchido(registro, CANDIDATOS.clienteNome),
      clienteDoc: primeiroPreenchido(registro, CANDIDATOS.clienteDoc),
      clienteIdExterno: primeiroPreenchido(registro, CANDIDATOS.clienteIdExterno),
      valor: primeiroPreenchido(registro, CANDIDATOS.valor),
      valorPago: primeiroPreenchido(registro, CANDIDATOS.valorPago),
      emissao: primeiroPreenchido(registro, CANDIDATOS.emissao),
      vencimento: primeiroPreenchido(registro, CANDIDATOS.vencimento),
      pagamento: primeiroPreenchido(registro, CANDIDATOS.pagamento),
      statusOrigem: primeiroPreenchido(registro, CANDIDATOS.statusOrigem),
    });

    if (cobranca) cobrancas.push(cobranca);
    else ignoradas.push(indice + 2); // +2: cabeçalho e índice base 1
  });

  return { cobrancas, ignoradas, colunas: cabecalho };
}

module.exports = {
  id: 'csv',
  rotulo: 'Importação CSV',
  configurado: () => true,
  motivoInativo: null,
  analisar,
  // O CSV não é puxado por job — ele chega por upload, então listar
  // não faz nada no ciclo automático.
  listar: async () => [],
};
