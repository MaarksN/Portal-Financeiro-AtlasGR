'use strict';

const { consultar, consultarUm, executar, agoraIso } = require('../db');
const config = require('../config');
const log = require('./log');
const { ErroApp } = require('./erros');
const bitrixDeals = require('./bitrixDeals');
const d4sign = require('./d4sign');

// ------------------------------------------------------------------
// Geração e acompanhamento de contratos: Bitrix24 (deal "Ganho") ->
// D4Sign (documento + assinatura) -> Bitrix24 (funil atualizado). Ver
// lib/cobrancaMensal.js para a rotina de boleto/nota (NXFacil).
// ------------------------------------------------------------------

/**
 * A partir do deal + contato do Bitrix24, monta os dados usados pra
 * preencher o contrato e cadastrar o signatário. Ajuste os campos
 * UF_CRM_* abaixo pros códigos reais do seu portal (crm.deal.fields).
 */
function montarDadosContrato(deal, contact) {
  const nomeContato = [contact?.NAME, contact?.LAST_NAME].filter(Boolean).join(' ') || deal?.TITLE || 'Cliente';
  return {
    dealId: String(deal.ID),
    dealTitulo: deal.TITLE,
    valor: Number(deal.OPPORTUNITY) || 0,
    moeda: deal.CURRENCY_ID,
    clienteNome: nomeContato,
    clienteEmail: contact?.EMAIL?.[0]?.VALUE || null,
    clienteTelefone: contact?.PHONE?.[0]?.VALUE || null,
    clienteDocumento: deal.UF_CRM_CPF_CNPJ || contact?.UF_CRM_CPF_CNPJ || null,
    plano: deal.UF_CRM_PLANO || null,
    vencimentoDia: deal.UF_CRM_DIA_VENCIMENTO || '10',
  };
}

/** Guarda/atualiza o retrato do deal — usado pela Carteira do painel. */
function upsertDeal(dados) {
  executar(
    `INSERT INTO contratos_deals (deal_id, titulo, cliente_nome, cliente_email, cliente_documento, valor_centavos, moeda, plano, vencimento_dia)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (deal_id) DO UPDATE SET
       titulo = excluded.titulo,
       cliente_nome = excluded.cliente_nome,
       cliente_email = excluded.cliente_email,
       cliente_documento = excluded.cliente_documento,
       valor_centavos = excluded.valor_centavos,
       moeda = excluded.moeda,
       plano = excluded.plano,
       vencimento_dia = excluded.vencimento_dia,
       atualizado_em = ?`,
    dados.dealId, dados.dealTitulo, dados.clienteNome, dados.clienteEmail, dados.clienteDocumento,
    Math.round((dados.valor || 0) * 100), dados.moeda, dados.plano, dados.vencimentoDia, agoraIso(),
  );
}

function salvarVinculoContrato({ dealId, d4signUuid, status }) {
  executar(
    `INSERT INTO contratos_links (deal_id, d4sign_uuid, status)
     VALUES (?, ?, ?)
     ON CONFLICT (deal_id) DO UPDATE SET
       d4sign_uuid = excluded.d4sign_uuid,
       status = excluded.status,
       atualizado_em = ?`,
    dealId, d4signUuid, status, agoraIso(),
  );
}

function atualizarStatusPorUuid(d4signUuid, status) {
  executar(
    `UPDATE contratos_links SET status = ?, atualizado_em = ? WHERE d4sign_uuid = ?`,
    status, agoraIso(), d4signUuid,
  );
  return consultarUm('SELECT deal_id FROM contratos_links WHERE d4sign_uuid = ?', d4signUuid)?.deal_id || null;
}

function buscarDealIdPorUuid(d4signUuid) {
  return consultarUm('SELECT deal_id FROM contratos_links WHERE d4sign_uuid = ?', d4signUuid)?.deal_id || null;
}

/**
 * Fluxo completo disparado quando um deal entra no estágio "gerar
 * contrato" no Bitrix24:
 *   1. Busca o deal + contato principal
 *   2. Cria o documento no D4Sign a partir do template
 *   3. Cadastra o cliente como signatário e envia para assinatura
 *   4. Salva o vínculo deal <-> documento
 *   5. Move o deal para o estágio "enviado para assinatura"
 */
async function gerarEEnviarContrato(dealId) {
  const deal = await bitrixDeals.getDeal(dealId);
  const contact = await bitrixDeals.getPrimaryContact(deal);
  const dados = montarDadosContrato(deal, contact);
  upsertDeal(dados);

  if (!dados.clienteEmail) {
    throw new ErroApp(`Deal ${dealId}: contato sem e-mail cadastrado — não é possível enviar para assinatura.`, {
      status: 422,
      codigo: 'contato_sem_email',
    });
  }

  const nomeDocumento = `Contrato - ${dados.clienteNome} - ${dados.dealTitulo}`.slice(0, 190);
  const documentoUuid = await d4sign.criarDocumentoDoTemplate({ nomeDocumento });

  await d4sign.cadastrarSignatarios(documentoUuid, [{
    email: dados.clienteEmail, act: '1', foreign: '0', certificadoicpbr: '0', assinatura_presencial: '0',
  }]);
  await d4sign.enviarParaAssinatura(documentoUuid, `Olá ${dados.clienteNome}, segue o contrato "${dados.dealTitulo}" para assinatura.`);

  salvarVinculoContrato({ dealId: dados.dealId, d4signUuid: documentoUuid, status: 'sent' });

  if (config.bitrix.estagios.enviado) {
    await bitrixDeals.updateDealStage(dados.dealId, config.bitrix.estagios.enviado);
  }
  await bitrixDeals.addTimelineComment(dados.dealId, `Contrato gerado e enviado para assinatura via D4Sign (documento ${documentoUuid}).`);

  log.info(`Deal ${dealId}: contrato ${documentoUuid} enviado para assinatura de ${dados.clienteEmail}.`);
  return { dealId: dados.dealId, documentoUuid };
}

/**
 * Trata os eventos do webhook do D4Sign e sincroniza de volta com o
 * Bitrix24 (avança/retrocede o funil). type_post: "1" finalizado,
 * "3" cancelado, "4" assinatura parcial, "2" e-mail não entregue.
 */
async function tratarEventoD4sign(payload) {
  const { uuid, type_post: typePost, message } = payload;
  const dealId = buscarDealIdPorUuid(uuid);
  if (!dealId) {
    log.aviso(`Webhook D4Sign: nenhum deal vinculado ao documento ${uuid} (evento: ${message}).`);
    return { tratado: false };
  }

  switch (String(typePost)) {
    case '1':
      atualizarStatusPorUuid(uuid, 'signed');
      if (config.bitrix.estagios.assinado) await bitrixDeals.updateDealStage(dealId, config.bitrix.estagios.assinado);
      await bitrixDeals.addTimelineComment(dealId, `Contrato assinado por todas as partes (D4Sign ${uuid}).`);
      return { tratado: true, acao: 'assinado' };

    case '3':
      atualizarStatusPorUuid(uuid, 'cancelled');
      if (config.bitrix.estagios.cancelado) await bitrixDeals.updateDealStage(dealId, config.bitrix.estagios.cancelado);
      await bitrixDeals.addTimelineComment(dealId, `Assinatura do contrato foi cancelada (D4Sign ${uuid}). ${payload.cancellation_message || ''}`);
      return { tratado: true, acao: 'cancelado' };

    case '4': {
      const signatarioEmail = payload.signer?.email || payload.email || 'signatário';
      await bitrixDeals.addTimelineComment(dealId, `${signatarioEmail} assinou o contrato (D4Sign ${uuid}).`);
      return { tratado: true, acao: 'assinatura_parcial' };
    }

    case '2':
      await bitrixDeals.addTimelineComment(
        dealId,
        `Atenção: e-mail do contrato não foi entregue para ${payload.signer?.email || payload.email} (D4Sign ${uuid}).`,
      );
      return { tratado: true, acao: 'email_nao_entregue' };

    default:
      log.aviso(`Webhook D4Sign: type_post desconhecido (${typePost}) para o documento ${uuid}.`);
      return { tratado: false };
  }
}

function listarDeals() {
  return consultar('SELECT * FROM contratos_deals ORDER BY atualizado_em DESC');
}

function listarLinks() {
  return consultar('SELECT * FROM contratos_links ORDER BY atualizado_em DESC');
}

module.exports = {
  montarDadosContrato,
  upsertDeal,
  salvarVinculoContrato,
  atualizarStatusPorUuid,
  buscarDealIdPorUuid,
  gerarEEnviarContrato,
  tratarEventoD4sign,
  listarDeals,
  listarLinks,
};
