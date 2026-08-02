'use strict';

const { erroDeEntrada } = require('../lib/erros');

// Middleware de validação com zod. Erro de schema vira 400 com a lista
// de campos, no mesmo formato de erro do resto da API.
function validarCorpo(schema) {
  return (req, res, next) => {
    const resultado = schema.safeParse(req.body ?? {});
    if (!resultado.success) {
      const detalhes = resultado.error.issues.map((problema) => ({
        campo: problema.path.join('.') || '(corpo)',
        mensagem: problema.message,
      }));
      return next(erroDeEntrada(detalhes[0]?.mensagem || 'Dados inválidos.', detalhes));
    }
    req.dados = resultado.data;
    return next();
  };
}

// Query string vem sempre como string; este helper limpa vazios para
// os filtros não receberem "" e virarem cláusula à toa.
const filtrosDaQuery = (query, chaves) => {
  const filtros = {};
  for (const chave of chaves) {
    const valor = query[chave];
    if (valor !== undefined && String(valor).trim() !== '') filtros[chave] = String(valor).trim();
  }
  return filtros;
};

const booleanoDaQuery = (valor) => valor === '1' || valor === 'true' || valor === 'sim';

module.exports = { validarCorpo, filtrosDaQuery, booleanoDaQuery };
