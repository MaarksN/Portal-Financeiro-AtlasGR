'use strict';

const config = require('../config');
const { consultar, consultarUm } = require('../db');

// ------------------------------------------------------------------
// Política de despesa. Ela não bloqueia o lançamento — marca. Quem
// decide é o aprovador, que vê o alerta destacado na linha da despesa
// junto com a justificativa do solicitante. Bloquear na digitação só
// faz o funcionário lançar na categoria errada.
//
// A exceção é o comprovante: sem ele, o relatório não sobe. Nota
// fiscal é exigência contábil, não política interna.
// ------------------------------------------------------------------

const categorias = () => consultar(
  'SELECT * FROM politica_categorias WHERE ativo = 1 ORDER BY categoria',
).map((linha) => ({
  categoria: linha.categoria,
  tetoCentavos: linha.teto_centavos,
  tetoPor: linha.teto_por,
  exigeComprovante: Boolean(linha.exige_comprovante),
  exigeJustificativa: Boolean(linha.exige_justificativa),
}));

const daCategoria = (nome) => consultarUm(
  'SELECT * FROM politica_categorias WHERE categoria = ? AND ativo = 1',
  nome,
);

const SEVERIDADE = { alto: 'alto', medio: 'medio' };

// ------------------------------------------------------------------
// Avalia uma despesa. `contexto` traz o que a despesa sozinha não
// sabe: as outras despesas do mesmo relatório (para teto diário e
// duplicidade) e se ela tem comprovante anexado.
// ------------------------------------------------------------------
function avaliarDespesa(despesa, contexto = {}) {
  const { irmas = [], temComprovante = false } = contexto;
  const regra = daCategoria(despesa.categoria);
  const alertas = [];

  if (!regra) {
    alertas.push({
      tipo: 'categoria_desconhecida',
      severidade: SEVERIDADE.medio,
      mensagem: `Categoria "${despesa.categoria}" não está na política vigente.`,
    });
  }

  // ------- Teto -------
  if (regra?.teto_centavos) {
    if (regra.teto_por === 'dia') {
      const doDia = irmas
        .filter((outra) => outra.id !== despesa.id
          && outra.categoria === despesa.categoria
          && outra.data === despesa.data)
        .reduce((soma, outra) => soma + outra.valor_centavos, 0);
      const total = doDia + despesa.valor_centavos;
      if (total > regra.teto_centavos) {
        alertas.push({
          tipo: 'teto_diario_excedido',
          severidade: SEVERIDADE.alto,
          mensagem: `${despesa.categoria} em ${despesa.data} soma ${formatar(total)}, acima do teto diário de ${formatar(regra.teto_centavos)}.`,
        });
      }
    } else if (despesa.valor_centavos > regra.teto_centavos) {
      alertas.push({
        tipo: 'teto_excedido',
        severidade: SEVERIDADE.alto,
        mensagem: `Acima do teto de ${formatar(regra.teto_centavos)} por lançamento em ${despesa.categoria}.`,
      });
    }
  }

  // ------- Comprovante -------
  const exigeComprovante = regra
    ? Boolean(regra.exige_comprovante)
    : despesa.valor_centavos > config.politica.exigeComprovanteAcimaDe;
  if (exigeComprovante && !temComprovante) {
    alertas.push({
      tipo: 'sem_comprovante',
      severidade: SEVERIDADE.alto,
      mensagem: 'Falta anexar o comprovante desta despesa.',
      bloqueia: true,
    });
  }

  // ------- Justificativa -------
  const precisaJustificar = Boolean(regra?.exige_justificativa)
    || alertas.some((a) => a.tipo.startsWith('teto'));
  if (precisaJustificar && !String(despesa.justificativa || '').trim()) {
    alertas.push({
      tipo: 'sem_justificativa',
      severidade: SEVERIDADE.medio,
      mensagem: 'Esta despesa exige justificativa por escrito.',
    });
  }

  // ------- Prazo de lançamento -------
  const diasDesde = Math.floor(
    (Date.now() - new Date(`${despesa.data}T00:00:00Z`).getTime()) / 86400000,
  );
  if (diasDesde > config.politica.prazoLancamentoDias) {
    alertas.push({
      tipo: 'fora_do_prazo',
      severidade: SEVERIDADE.medio,
      mensagem: `Gasto de ${diasDesde} dias atrás, acima do prazo de ${config.politica.prazoLancamentoDias} dias para lançamento.`,
    });
  }
  if (despesa.data > new Date().toISOString().slice(0, 10)) {
    alertas.push({
      tipo: 'data_futura',
      severidade: SEVERIDADE.alto,
      mensagem: 'A data da despesa está no futuro.',
    });
  }

  // ------- Possível duplicidade -------
  const gemea = irmas.find((outra) => outra.id !== despesa.id
    && outra.data === despesa.data
    && outra.categoria === despesa.categoria
    && outra.valor_centavos === despesa.valor_centavos);
  if (gemea) {
    alertas.push({
      tipo: 'possivel_duplicidade',
      severidade: SEVERIDADE.alto,
      mensagem: 'Mesma data, categoria e valor de outra despesa deste relatório.',
    });
  }

  return alertas;
}

const formatar = (centavos) => (Number(centavos || 0) / 100)
  .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ------------------------------------------------------------------
// Cadeia de alçada. O relatório sobe por TODOS os níveis cujo teto é
// menor que o total — R$ 6.000 passa por coordenação, gerência e
// diretoria, nessa ordem. É o comportamento que o financeiro espera
// de aprovação em cadeia (e o que a auditoria cobra depois).
// ------------------------------------------------------------------
function cadeiaDeAlcada(totalCentavos) {
  const cadeia = [];
  for (const faixa of config.politica.alcadas) {
    cadeia.push({ nivel: faixa.nivel, rotulo: faixa.rotulo });
    if (faixa.ate === null || totalCentavos <= faixa.ate) break;
  }
  return cadeia;
}

// Só o rótulo do último nível — usado no resumo da tela.
const alcadaFinal = (totalCentavos) => cadeiaDeAlcada(totalCentavos).at(-1);

module.exports = {
  categorias,
  daCategoria,
  avaliarDespesa,
  cadeiaDeAlcada,
  alcadaFinal,
};
