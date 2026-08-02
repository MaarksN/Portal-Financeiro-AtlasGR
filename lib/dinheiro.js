'use strict';

// Dinheiro circula em centavos (inteiro) do banco até a API. A
// conversão acontece só na borda: entrada do usuário vira centavos
// aqui, e a formatação para exibição também. Nunca somar float.

const { ErroApp } = require('./erros');

function paraCentavos(valor, { campo = 'valor' } = {}) {
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) throw new ErroApp(`${campo} inválido.`, { codigo: 'entrada_invalida' });
    return Math.round(valor * 100);
  }

  const texto = String(valor ?? '').trim();
  if (!texto) throw new ErroApp(`Informe o ${campo}.`, { codigo: 'entrada_invalida' });

  // Aceita "1.234,56" (padrão brasileiro), "1234.56" e "1234,56".
  let normalizado = texto.replace(/[R$\s ]/gi, '');
  const temVirgula = normalizado.includes(',');
  const temPonto = normalizado.includes('.');

  if (temVirgula && temPonto) {
    // O último separador é o decimal.
    normalizado = normalizado.lastIndexOf(',') > normalizado.lastIndexOf('.')
      ? normalizado.replace(/\./g, '').replace(',', '.')
      : normalizado.replace(/,/g, '');
  } else if (temVirgula) {
    normalizado = normalizado.replace(',', '.');
  }

  const numero = Number(normalizado);
  if (!Number.isFinite(numero)) throw new ErroApp(`${campo} inválido.`, { codigo: 'entrada_invalida' });
  return Math.round(numero * 100);
}

const deCentavos = (centavos) => Number(centavos || 0) / 100;

const formatar = (centavos) => deCentavos(centavos).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

module.exports = { paraCentavos, deCentavos, formatar };
