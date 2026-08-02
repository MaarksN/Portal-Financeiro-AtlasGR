'use strict';

// ------------------------------------------------------------------
// O funil de cobrança. Estes estágios são propriedade DO PORTAL — a
// origem (Bitrix, Connect Plus, Perfil Securitário) manda nos dados
// financeiros da fatura; quem manda no estágio é o financeiro, aqui.
// Isso é o que permite trabalhar a carteira sem escrever de volta nos
// sistemas legados.
// ------------------------------------------------------------------

const ESTAGIOS = Object.freeze([
  { id: 'a_vencer',   rotulo: 'A vencer',              tom: 'neutro',  tipo: 'aberto',         automatico: true },
  { id: 'vencida',    rotulo: 'Vencida',               tom: 'atencao', tipo: 'aberto',         automatico: true },
  { id: 'contato',    rotulo: 'Contato feito',         tom: 'atencao', tipo: 'aberto' },
  { id: 'negociacao', rotulo: 'Em negociação',         tom: 'info',    tipo: 'aberto' },
  { id: 'promessa',   rotulo: 'Promessa de pagamento', tom: 'info',    tipo: 'aberto', exigeData: true },
  { id: 'acordo',     rotulo: 'Acordo / parcelado',    tom: 'info',    tipo: 'aberto' },
  { id: 'juridico',   rotulo: 'Jurídico',              tom: 'critico', tipo: 'aberto', exigeJustificativa: true },
  { id: 'paga',       rotulo: 'Paga',                  tom: 'ok',      tipo: 'ganho' },
  { id: 'perda',      rotulo: 'Perda / baixa',         tom: 'critico', tipo: 'perda',  exigeJustificativa: true },
]);

const PORID = new Map(ESTAGIOS.map((estagio) => [estagio.id, estagio]));

const estagio = (id) => PORID.get(id) || null;
const existe = (id) => PORID.has(id);
const encerrado = (id) => ['ganho', 'perda'].includes(estagio(id)?.tipo);

// Estágios que a automação pode reescrever. Assim que alguém trabalha
// a fatura (contato, negociação, promessa...), a automação para de
// mexer — senão o trabalho manual seria desfeito toda sincronização.
const AUTOMATICOS = new Set(ESTAGIOS.filter((e) => e.automatico).map((e) => e.id));

const HOJE = () => new Date().toISOString().slice(0, 10);

function diasEmAtraso(vencimento, referencia = HOJE()) {
  if (!vencimento) return 0;
  const ms = new Date(`${referencia}T00:00:00Z`) - new Date(`${vencimento}T00:00:00Z`);
  return Math.floor(ms / 86400000);
}

const FAIXAS = Object.freeze([
  { id: 'a_vencer', rotulo: 'A vencer',   min: -Infinity, max: 0 },
  { id: 'd1_30',    rotulo: '1 a 30 dias',   min: 1,   max: 30 },
  { id: 'd31_60',   rotulo: '31 a 60 dias',  min: 31,  max: 60 },
  { id: 'd61_90',   rotulo: '61 a 90 dias',  min: 61,  max: 90 },
  { id: 'd90mais',  rotulo: 'Mais de 90 dias', min: 91, max: Infinity },
]);

function faixaAging(vencimento, referencia = HOJE()) {
  const dias = diasEmAtraso(vencimento, referencia);
  return FAIXAS.find((faixa) => dias >= faixa.min && dias <= faixa.max) || FAIXAS[0];
}

// Estágio que a fatura deveria ter só pela passagem do tempo. Devolve
// null quando não há nada a fazer (fatura já trabalhada ou encerrada).
function estagioPorTempo(cobranca, referencia = HOJE()) {
  if (!AUTOMATICOS.has(cobranca.estagio)) return null;
  const devido = diasEmAtraso(cobranca.vencimento, referencia) > 0 ? 'vencida' : 'a_vencer';
  return devido === cobranca.estagio ? null : devido;
}

// Regras de transição. Devolve string com o motivo quando a mudança
// não pode acontecer, ou null quando está liberada.
function validarTransicao(de, para, { promessaEm, justificativa } = {}) {
  if (!existe(para)) return 'Estágio desconhecido.';
  if (de === para) return 'A fatura já está neste estágio.';

  const destino = estagio(para);

  if (destino.exigeData && !promessaEm) {
    return 'Promessa de pagamento exige a data combinada com o cliente.';
  }
  if (destino.exigeJustificativa && !String(justificativa || '').trim()) {
    return `Mover para "${destino.rotulo}" exige uma justificativa.`;
  }
  if (destino.id === 'promessa' && promessaEm && promessaEm < HOJE()) {
    return 'A data da promessa não pode ser no passado.';
  }
  if (encerrado(de) && de === 'paga') {
    return 'Fatura paga não volta para o funil. Registre uma nova cobrança se for o caso.';
  }
  return null;
}

module.exports = {
  ESTAGIOS,
  FAIXAS,
  estagio,
  existe,
  encerrado,
  diasEmAtraso,
  faixaAging,
  estagioPorTempo,
  validarTransicao,
  hoje: HOJE,
};
