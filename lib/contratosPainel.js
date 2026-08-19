'use strict';

const { consultar } = require('../db');
const config = require('../config');
const contratos = require('./contratos');
const { referenciaMesAtual } = require('./cobrancaMensal');

// ------------------------------------------------------------------
// Leitura agregada pro painel do módulo Contratos & Cobrança: carteira
// (join deal + contrato + última cobrança), KPIs e alertas gerenciais.
// Tudo derivado do que já está no banco — nenhuma chamada externa.
// ------------------------------------------------------------------

const ROTULO_STATUS = { sent: 'Enviado para assinatura', signed: 'Assinado', cancelled: 'Cancelado' };

const DIAS_ATENCAO = 3;
const DIAS_CRITICO = 10;

function diasDesde(dataIso) {
  if (!dataIso) return null;
  const normalizado = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dataIso) ? `${dataIso.replace(' ', 'T')}Z` : dataIso;
  const ms = Date.now() - new Date(normalizado).getTime();
  return Number.isNaN(ms) ? null : Math.floor(ms / (24 * 3600 * 1000));
}

function montarCarteira() {
  const deals = contratos.listarDeals();
  const links = contratos.listarLinks();
  const cobrancas = consultar('SELECT * FROM contratos_cobrancas ORDER BY criado_em DESC');

  const linkPorDeal = new Map(links.map((l) => [l.deal_id, l]));
  const ultimaCobrancaPorDeal = new Map();
  for (const c of cobrancas) {
    if (!ultimaCobrancaPorDeal.has(c.deal_id)) ultimaCobrancaPorDeal.set(c.deal_id, c);
  }

  return deals.map((deal) => {
    const link = linkPorDeal.get(deal.deal_id);
    const cobranca = ultimaCobrancaPorDeal.get(deal.deal_id);
    return {
      dealId: deal.deal_id,
      titulo: deal.titulo,
      clienteNome: deal.cliente_nome,
      clienteEmail: deal.cliente_email,
      valorCentavos: deal.valor_centavos,
      moeda: deal.moeda || 'BRL',
      plano: deal.plano,
      contratoStatus: link?.status || null,
      contratoStatusRotulo: link ? (ROTULO_STATUS[link.status] || link.status) : 'Sem contrato gerado',
      contratoAtualizadoEm: link?.atualizado_em || null,
      ultimaCobranca: cobranca
        ? { mesReferencia: cobranca.mes_referencia, boletoStatus: cobranca.boleto_status, notaStatus: cobranca.nota_status }
        : null,
      atualizadoEm: deal.atualizado_em,
    };
  });
}

function montarKpis() {
  const carteira = montarCarteira();
  const links = contratos.listarLinks();
  const mesReferencia = referenciaMesAtual();
  const cobrancasMes = consultar('SELECT * FROM contratos_cobrancas WHERE mes_referencia = ?', mesReferencia);

  const totalCarteiraCentavos = carteira.reduce((soma, d) => soma + (d.valorCentavos || 0), 0);

  const contagem = { sent: 0, signed: 0, cancelled: 0 };
  links.forEach((l) => { if (contagem[l.status] !== undefined) contagem[l.status] += 1; });
  const totalComContrato = contagem.sent + contagem.signed + contagem.cancelled;
  const taxaAssinatura = totalComContrato > 0 ? (contagem.signed / totalComContrato) * 100 : 0;

  const cobranca = { ok: 0, mock: 0, error: 0, pending: 0 };
  cobrancasMes.forEach((c) => { cobranca[c.boleto_status in cobranca ? c.boleto_status : 'pending'] += 1; });

  return {
    totalCarteiraCentavos,
    totalDeals: carteira.length,
    contratos: { ...contagem, total: totalComContrato },
    taxaAssinatura,
    cobrancaMes: { mesReferencia, total: cobrancasMes.length, ...cobranca },
  };
}

function montarAlertas() {
  const links = contratos.listarLinks();
  const deals = new Map(contratos.listarDeals().map((d) => [d.deal_id, d]));
  const mesReferencia = referenciaMesAtual();
  const cobrancasMes = consultar('SELECT * FROM contratos_cobrancas WHERE mes_referencia = ?', mesReferencia);

  const alertas = [];

  for (const link of links) {
    if (link.status !== 'sent') continue;
    const dias = diasDesde(link.atualizado_em || link.criado_em);
    if (dias === null || dias < DIAS_ATENCAO) continue;
    const deal = deals.get(link.deal_id);
    alertas.push({
      id: `assinatura-${link.deal_id}`,
      severidade: dias >= DIAS_CRITICO ? 'critico' : 'atencao',
      titulo: `Contrato aguardando assinatura há ${dias} dia(s)`,
      subtitulo: `${deal?.cliente_nome || deal?.titulo || `Deal ${link.deal_id}`} — documento D4Sign ${link.d4sign_uuid}`,
      tag: 'Assinatura',
      dealId: link.deal_id,
    });
  }

  for (const c of cobrancasMes) {
    if (c.boleto_status === 'error' || c.nota_status === 'error') {
      const deal = deals.get(c.deal_id);
      alertas.push({
        id: `cobranca-erro-${c.deal_id}`,
        severidade: 'critico',
        titulo: `Falha na cobrança de ${mesReferencia}`,
        subtitulo: `${deal?.cliente_nome || deal?.titulo || `Deal ${c.deal_id}`} — boleto: ${c.boleto_status}, nota: ${c.nota_status}`,
        tag: 'Cobrança',
        dealId: c.deal_id,
      });
    }
  }

  const hojeDia = new Date().getUTCDate();
  if (hojeDia > 2 && cobrancasMes.length === 0 && config.bitrix.estagios.ganhoParaCobranca) {
    alertas.push({
      id: `cobranca-mes-pendente-${mesReferencia}`,
      severidade: 'atencao',
      titulo: `Cobrança mensal de ${mesReferencia} ainda não foi executada`,
      subtitulo: 'Rode manualmente pela aba Ações ou aguarde o job do dia 1.',
      tag: 'Rotina mensal',
      dealId: null,
    });
  }

  if (!config.bitrix.configurado) {
    alertas.push({ id: 'config-bitrix', severidade: 'atencao', titulo: 'Bitrix24 não configurado', subtitulo: 'Defina BITRIX_WEBHOOK nas variáveis de ambiente.', tag: 'Configuração', dealId: null });
  }
  if (!config.d4sign.configurado) {
    alertas.push({ id: 'config-d4sign', severidade: 'atencao', titulo: 'D4Sign não configurado', subtitulo: 'Defina D4SIGN_TOKEN_API, D4SIGN_CRYPT_KEY, D4SIGN_UUID_SAFE e D4SIGN_TEMPLATE_ID.', tag: 'Configuração', dealId: null });
  }
  if (config.nxfacil.mode === 'mock') {
    alertas.push({ id: 'config-nxfacil-mock', severidade: 'info', titulo: 'NXFacil em modo mock', subtitulo: 'Nenhum boleto/nota real está sendo emitido. Ajuste NXFACIL_MODE=http quando tiver as credenciais.', tag: 'Configuração', dealId: null });
  }

  const ordem = { critico: 0, atencao: 1, info: 2 };
  alertas.sort((a, b) => ordem[a.severidade] - ordem[b.severidade]);
  return alertas;
}

module.exports = { montarCarteira, montarKpis, montarAlertas };
