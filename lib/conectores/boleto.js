'use strict';

const { PDFParse } = require('pdf-parse');
const { paraDataIso, paraCentavosSeguro } = require('./comum');
const { ErroApp } = require('../erros');

// ------------------------------------------------------------------
// Leitura de boleto (Sicredi, formato FEBRABAN padrão) e do
// "informativo" que às vezes o acompanha (detalhamento por veículo,
// no caso da Atlas GR). Extração por texto rotulado, não por posição
// de coluna — mais robusto a pequenas variações de layout entre
// bancos, e verificável por humano (os mesmos rótulos que aparecem
// no PDF impresso).
//
// Nunca decodifica a linha digitável pra tirar vencimento/valor: os
// campos já vêm rotulados em texto no boleto, e usar esses rótulos é
// mais confiável do que reimplementar o algoritmo do fator de
// vencimento — um bug ali gravaria data errada silenciosamente. A
// linha digitável só serve de identificador estável.
// ------------------------------------------------------------------

async function extrairTexto(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const resultado = await parser.getText();
    return resultado.text;
  } finally {
    await parser.destroy();
  }
}

async function analisarBoleto(buffer) {
  const texto = await extrairTexto(buffer);
  const avisos = [];

  const linhaDigitavelMatch = texto.match(/Linha Digitável:\s*([\d.\s]+)/);
  const linhaDigitavel = linhaDigitavelMatch ? linhaDigitavelMatch[1].replace(/\D/g, '') : null;

  const blocoVencValor = texto.match(
    /Número do documento\s+Contrato\s+CPF\/CEI\/CNPJ\s+Vencimento\s+Valor do Documento\s*\n(\S+)\s+(\S+)\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.,]+)/,
  );
  const blocoDocumento = texto.match(
    /No documento\s+Espécie doc\.\s+Aceite\s+Data processamento\s+Nosso número\s*\n(\S+)\s+(\S+)\s+(\S+)\s+(\d{2}\/\d{2}\/\d{4})\s+(\S+)/,
  );
  const sacadoMatch = texto.match(/Sacado\s*\n(.+?)\s*-\s*CPF\/CNPJ:\s*([\d.\-/]+)/);
  const cedenteMatch = texto.match(/Cedente[^\n]*\n(.+?)\s*-\s*CNPJ:\s*([\d.\-/]+)/);
  const refNotaMatch = texto.match(/Ref\.\s*Nota:\s*(\d+)/);
  const valorTopoMatch = texto.match(/^Valor:\s*([\d.,]+)/m);

  const documento = blocoDocumento?.[1] || blocoVencValor?.[1] || null;
  const emissao = blocoDocumento ? paraDataIso(blocoDocumento[4]) : null;
  const nossoNumero = blocoDocumento?.[5] || null;
  const vencimento = blocoVencValor ? paraDataIso(blocoVencValor[3]) : null;
  const valorTexto = blocoVencValor?.[4] || valorTopoMatch?.[1] || null;
  const clienteNome = sacadoMatch?.[1]?.trim() || null;
  const clienteDoc = sacadoMatch?.[2] || null;

  if (!vencimento) avisos.push('Não encontrei o vencimento — confira e preencha manualmente.');
  if (!valorTexto) avisos.push('Não encontrei o valor — confira e preencha manualmente.');
  if (!clienteNome) avisos.push('Não encontrei o nome do sacado (cliente) — confira e preencha manualmente.');
  if (!documento && !nossoNumero && !linhaDigitavel) {
    throw new ErroApp('Não foi possível identificar este boleto (sem documento, nosso número nem linha digitável).', {
      codigo: 'boleto_ilegivel',
    });
  }

  return {
    idExterno: nossoNumero || documento || linhaDigitavel,
    documento,
    nossoNumero,
    linhaDigitavel,
    clienteNome,
    clienteDoc,
    cedenteNome: cedenteMatch?.[1]?.trim() || null,
    cedenteDoc: cedenteMatch?.[2] || null,
    valorCentavos: paraCentavosSeguro(valorTexto, null),
    emissao,
    vencimento,
    refNota: refNotaMatch?.[1] || null,
    avisos,
  };
}

// Linha: "PLACA TRANSPORTADOR   MÊS DE ANO   VALOR   R$"
const LINHA_VEICULO = /^(\S+)\s+(.+?)\s+([A-ZÇÃÕÁÉÍÓÚÂÊÔÀ]+ DE \d{4})\s+([\d.,]+)\s*R\$\s*$/gm;

async function analisarInformativo(buffer) {
  const texto = await extrairTexto(buffer);
  const itens = [];

  for (const match of texto.matchAll(LINHA_VEICULO)) {
    const [, placa, transportador, mesReferencia, valorTexto] = match;
    itens.push({
      placa: placa.trim(),
      transportador: transportador.trim(),
      mesReferencia: mesReferencia.trim(),
      valorCentavos: paraCentavosSeguro(valorTexto, 0),
    });
  }

  const totalMatch = texto.match(/VALOR TOTAL\s+([\d.,]+)/);
  const valorTotalCentavos = totalMatch ? paraCentavosSeguro(totalMatch[1], null) : null;
  const somaItensCentavos = itens.reduce((soma, item) => soma + item.valorCentavos, 0);

  return {
    itens,
    valorTotalCentavos,
    somaItensCentavos,
    divergente: valorTotalCentavos !== null && valorTotalCentavos !== somaItensCentavos,
  };
}

module.exports = { analisarBoleto, analisarInformativo };
