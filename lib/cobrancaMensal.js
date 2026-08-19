'use strict';

const { consultar, consultarUm, executar } = require('../db');
const config = require('../config');
const log = require('./log');
const bitrixDeals = require('./bitrixDeals');
const nxfacil = require('./nxfacil');
const contratos = require('./contratos');

// ------------------------------------------------------------------
// Rotina mensal: busca os deals "Ganhos" no Bitrix24 e, para cada um
// ainda não cobrado neste mês, pede à NXFacil boleto + nota fiscal.
// Idempotente via UNIQUE(deal_id, mes_referencia) em contratos_cobrancas.
// ------------------------------------------------------------------

function referenciaMesAtual(data = new Date()) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

function vencimentoParaDeal(diaVencimento, mesReferencia) {
  const [ano, mes] = mesReferencia.split('-').map(Number);
  const dia = Number(diaVencimento) || 10;
  return new Date(Date.UTC(ano, mes - 1, dia)).toISOString().slice(0, 10);
}

function jaCobradoNoMes(dealId, mesReferencia) {
  return Boolean(consultarUm(
    'SELECT 1 FROM contratos_cobrancas WHERE deal_id = ? AND mes_referencia = ?',
    dealId, mesReferencia,
  ));
}

function registrarCobranca({ dealId, mesReferencia, boletoStatus, notaStatus, detalhe }) {
  executar(
    `INSERT INTO contratos_cobrancas (deal_id, mes_referencia, boleto_status, nota_status, detalhe)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (deal_id, mes_referencia) DO UPDATE SET
       boleto_status = excluded.boleto_status,
       nota_status = excluded.nota_status,
       detalhe = excluded.detalhe`,
    dealId, mesReferencia, boletoStatus, notaStatus, JSON.stringify(detalhe || {}),
  );
}

function listarCobrancas({ mesReferencia } = {}) {
  return mesReferencia
    ? consultar('SELECT * FROM contratos_cobrancas WHERE mes_referencia = ? ORDER BY criado_em DESC', mesReferencia)
    : consultar('SELECT * FROM contratos_cobrancas ORDER BY criado_em DESC LIMIT 500');
}

async function rodarCobrancaMensal({ mesReferencia = referenciaMesAtual() } = {}) {
  const deals = await bitrixDeals.listarGanhosParaCobranca({
    stageId: config.bitrix.estagios.ganhoParaCobranca,
    categoryId: config.bitrix.categoriaContratos,
  });

  log.info(`Cobrança mensal (${mesReferencia}): ${deals.length} deal(s) no estágio de faturamento.`);

  const resultados = [];
  for (const deal of deals) {
    const dealId = String(deal.ID);
    if (jaCobradoNoMes(dealId, mesReferencia)) {
      log.info(`Deal ${dealId}: já cobrado em ${mesReferencia}, pulando.`);
      continue;
    }

    try {
      const contact = deal.CONTACT_ID ? await bitrixDeals.getPrimaryContact(deal) : null;
      const dados = contratos.montarDadosContrato(deal, contact);
      contratos.upsertDeal(dados);

      const cobranca = {
        dealId: dados.dealId,
        dealTitulo: dados.dealTitulo,
        clienteNome: dados.clienteNome,
        clienteDocumento: dados.clienteDocumento,
        valor: dados.valor,
        plano: dados.plano,
        vencimento: vencimentoParaDeal(dados.vencimentoDia, mesReferencia),
      };

      const boleto = await nxfacil.gerarBoleto(cobranca);
      const nota = await nxfacil.emitirNotaFiscal(cobranca);

      registrarCobranca({
        dealId: dados.dealId, mesReferencia, boletoStatus: boleto.status, notaStatus: nota.status,
        detalhe: { boleto, nota },
      });

      const notaModo = config.nxfacil.mode === 'mock' ? ' (modo mock — nenhuma chamada real foi feita)' : '';
      await bitrixDeals.addTimelineComment(dados.dealId, `Rotina mensal (${mesReferencia}): boleto e nota fiscal processados via NXFacil.${notaModo}`);

      resultados.push({ dealId: dados.dealId, ok: true, boleto, nota });
    } catch (erro) {
      log.erro(`Deal ${dealId}: falha na cobrança mensal`, { erro: erro.message });
      registrarCobranca({ dealId, mesReferencia, boletoStatus: 'error', notaStatus: 'error', detalhe: { erro: erro.message } });
      resultados.push({ dealId, ok: false, erro: erro.message });
    }
  }

  return { mesReferencia, total: deals.length, resultados };
}

module.exports = { referenciaMesAtual, jaCobradoNoMes, registrarCobranca, listarCobrancas, rodarCobrancaMensal };
