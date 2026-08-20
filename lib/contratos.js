'use strict';

const { consultar, consultarUm, executar, agoraIso } = require('../db');
const config = require('../config');
const log = require('./log');
const { ErroApp } = require('./erros');
const bitrixDeals = require('./bitrixDeals');
const d4sign = require('./d4sign');

// ------------------------------------------------------------------
// Geração e acompanhamento de contratos: Bitrix24 (deal "Ganho") ->
// D4Sign (documento + assinatura) -> Bitrix24 (funil atualizado).
// Mapeamento automático completo de campos da Empresa, Contato e Negócio.
// ------------------------------------------------------------------

function formatarMoedaExtenso(valorReais) {
  if (!valorReais || isNaN(valorReais)) return 'zero reais';
  const v = Number(valorReais).toFixed(2);
  return `R$ ${v} (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorReais)})`;
}

/**
 * A partir do deal + contato + empresa do Bitrix24, monta os dados completos
 * usados para preencher as variáveis do contrato e cadastrar o signatário.
 */
function montarDadosContrato(deal, contact = null, company = null) {
  const nomeContato = [contact?.NAME, contact?.LAST_NAME].filter(Boolean).join(' ').trim();
  const razaoSocial = company?.TITLE || deal?.TITLE || 'Cliente';
  const nomeSignatario = nomeContato || razaoSocial || 'Representante Legal';

  // Identificação de CNPJ / CPF (Prioridade: Empresa -> Deal -> Contato)
  const cnpj = (company?.UF_CRM_1785182242607 || company?.UF_CRM_CPF_CNPJ || deal?.UF_CRM_CPF_CNPJ || contact?.UF_CRM_CPF_CNPJ || '').trim();
  const cpfSignatario = (contact?.UF_CRM_CPF || deal?.UF_CRM_CPF || '').trim();

  // E-mail (Prioridade: Contato -> Campo custom do Deal -> Empresa)
  const emailSignatario = contact?.EMAIL?.[0]?.VALUE
    || (typeof contact?.EMAIL === 'string' ? contact?.EMAIL : null)
    || deal?.UF_CRM_1710946957351
    || company?.EMAIL?.[0]?.VALUE
    || (typeof company?.EMAIL === 'string' ? company?.EMAIL : null)
    || null;

  // Telefone / WhatsApp
  const telefoneSignatario = contact?.PHONE?.[0]?.VALUE
    || (typeof contact?.PHONE === 'string' ? contact?.PHONE : null)
    || company?.PHONE?.[0]?.VALUE
    || (typeof company?.PHONE === 'string' ? company?.PHONE : null)
    || null;

  const cargo = contact?.POST || 'Representante Legal';
  const valor = Number(deal?.OPPORTUNITY) || 0;
  const valorCentavos = Math.round(valor * 100);
  const moeda = deal?.CURRENCY_ID || 'BRL';
  const plano = deal?.UF_CRM_PLANO || deal?.TITLE || 'Atlas GR Monitoramento & Gestão';
  const vencimentoDia = String(deal?.UF_CRM_DIA_VENCIMENTO || '10');
  const vigencia = deal?.UF_CRM_VIGENCIA || '12 meses';
  const dataContrato = deal?.UF_CRM_1770928318695 || agoraIso().slice(0, 10);

  // Endereço
  const logradouro = company?.ADDRESS || company?.REG_ADDRESS || '';
  const cidade = company?.ADDRESS_CITY || company?.REG_ADDRESS_CITY || '';
  const estado = company?.ADDRESS_PROVINCE || company?.REG_ADDRESS_PROVINCE || '';
  const cep = company?.ADDRESS_POSTAL_CODE || company?.REG_ADDRESS_POSTAL_CODE || '';
  const enderecoCompleto = [logradouro, cidade, estado, cep].filter(Boolean).join(', ') || 'Endereço cadastrado no CRM';

  // Variáveis D4Sign correspondentes às tags do Word / Template
  const variaveisD4Sign = {
    RAZAO_SOCIAL: razaoSocial,
    NOME_FANTASIA: company?.TITLE || razaoSocial,
    CNPJ: cnpj || 'Conforme cadastro',
    ENDERECO_COMPLETO: enderecoCompleto,
    NOME_SIGNATARIO: nomeSignatario,
    CPF_SIGNATARIO: cpfSignatario || 'Conforme documento',
    EMAIL_SIGNATARIO: emailSignatario || '',
    TELEFONE_SIGNATARIO: telefoneSignatario || '',
    CARGO_SIGNATARIO: cargo,
    VALOR_MENSAL: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor),
    VALOR_EXTENSO: formatarMoedaExtenso(valor),
    DIA_VENCIMENTO: vencimentoDia,
    PLANO: plano,
    VIGENCIA: vigencia,
    DATA_CONTRATO: dataContrato,
    DEAL_ID: String(deal?.ID || ''),
  };

  return {
    dealId: String(deal.ID),
    dealTitulo: deal.TITLE,
    valor,
    valorCentavos,
    moeda,
    clienteNome: razaoSocial,
    razaoSocial,
    cnpj,
    nomeSignatario,
    cpfSignatario,
    clienteEmail: emailSignatario,
    clienteTelefone: telefoneSignatario,
    clienteDocumento: cnpj || cpfSignatario || null,
    cargo,
    plano,
    vencimentoDia,
    vigencia,
    enderecoCompleto,
    dataContrato,
    variaveisD4Sign,
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
    dados.valorCentavos, dados.moeda, dados.plano, dados.vencimentoDia, agoraIso(),
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
 * Retorna a prévia completa de todos os campos mapeados a partir do Bitrix24
 * antes de disparar o contrato para assinatura.
 */
async function buscarPreviaCampos(dealId, origem = 'atlasgr') {
  const deal = await bitrixDeals.getDeal(dealId, origem);
  if (!deal) throw new ErroApp(`Negócio ${dealId} não encontrado no Bitrix24.`, { status: 404 });

  const contact = await bitrixDeals.getPrimaryContact(deal, origem);
  const company = await bitrixDeals.getCompany(deal.COMPANY_ID, origem);

  return montarDadosContrato(deal, contact, company);
}

/**
 * Fluxo completo disparado quando um deal entra no estágio "gerar contrato"
 * ou quando o usuário clica em "Gerar e enviar contrato":
 *   1. Busca o deal + contato principal + empresa
 *   2. Monta variáveis completas para o contrato
 *   3. Cria o documento no D4Sign a partir do template com variáveis injetadas
 *   4. Cadastra o signatário e envia para assinatura
 *   5. Salva o vínculo deal <-> documento no banco local
 *   6. Atualiza o estágio no Bitrix24 para "Aguardando Assinatura"
 *   7. Registra comentário de auditoria na timeline do CRM
 */
async function gerarEEnviarContrato(dealId, origem = 'atlasgr') {
  const deal = await bitrixDeals.getDeal(dealId, origem);
  if (!deal) throw new ErroApp(`Negócio ${dealId} não encontrado no Bitrix24.`, { status: 404 });

  const contact = await bitrixDeals.getPrimaryContact(deal, origem);
  const company = await bitrixDeals.getCompany(deal.COMPANY_ID, origem);
  const dados = montarDadosContrato(deal, contact, company);
  upsertDeal(dados);

  if (!dados.clienteEmail) {
    throw new ErroApp(`Deal ${dealId} (${dados.razaoSocial}): contato sem e-mail cadastrado no Bitrix24 — informe um e-mail para enviar a assinatura.`, {
      status: 422,
      codigo: 'contato_sem_email',
    });
  }

  const nomeDocumento = `Contrato Atlas GR - ${dados.razaoSocial} (Deal #${dealId})`;
  log.info(`Iniciando geração de contrato no D4Sign para Deal ${dealId}`, { nomeDocumento, email: dados.clienteEmail });

  let documentoUuid = null;
  if (config.d4sign.configurado) {
    documentoUuid = await d4sign.criarDocumentoDoTemplate({
      nomeDocumento,
      variaveis: dados.variaveisD4Sign,
    });

    await d4sign.cadastrarSignatarios(documentoUuid, [
      {
        email: dados.clienteEmail,
        act: '1', // 1 = Assinar
        foreign_lang: '0',
        folha: '',
        signature_type: 'email',
        name: dados.nomeSignatario,
        documentation: dados.cpfSignatario || dados.cnpj || undefined,
      },
    ]);

    await d4sign.enviarParaAssinatura(
      documentoUuid,
      `Olá ${dados.nomeSignatario}, segue o contrato de prestação de serviços da Atlas GR para sua assinatura digital.`,
    );
  } else {
    documentoUuid = `mock-d4sign-${dealId}-${Date.now()}`;
    log.aviso('D4Sign não configurado no .env — contrato gerado em modo simulado.', { documentoUuid });
  }

  salvarVinculoContrato({ dealId, d4signUuid: documentoUuid, status: 'sent' });

  // Move o deal no Bitrix24 para o estágio "Aguardando Assinatura"
  const stageSent = config.bitrix.stageSent || config.bitrix.estagios?.enviado || 'C20:UC_H2J1XM';
  try {
    await bitrixDeals.updateDealStage(dealId, stageSent, origem);
    await bitrixDeals.addTimelineComment(
      dealId,
      `[Portal Financeiro AtlasGR] Contrato gerado com sucesso via D4Sign e enviado para assinatura de ${dados.nomeSignatario} (${dados.clienteEmail}). UUID: ${documentoUuid}`,
      origem,
    );
  } catch (err) {
    log.aviso(`Não foi possível atualizar o estágio no Bitrix24: ${err.message}`);
  }

  return {
    dealId,
    documentoUuid,
    dados,
    status: 'sent',
  };
}

/**
 * Trata o webhook enviado pela D4Sign quando o documento muda de estado
 * (assinado por todos ou cancelado).
 */
async function tratarEventoD4sign({ documentoUuid, status, payload = {}, cabecalhoHmac = null }) {
  if (!documentoUuid) {
    throw new ErroApp('documentoUuid é obrigatório.', { status: 400 });
  }

  if (!d4sign.validarAssinaturaWebhook(documentoUuid, cabecalhoHmac)) {
    throw new ErroApp('Assinatura HMAC do webhook D4Sign inválida.', { status: 401, codigo: 'hmac_invalido' });
  }

  const mapaStatus = {
    signed: 'signed',
    '4': 'signed',
    'Documento finalizado': 'signed',
    cancelled: 'cancelled',
    '5': 'cancelled',
    'Documento cancelado': 'cancelled',
  };
  const statusNormalizado = mapaStatus[status] || status;

  const dealId = atualizarStatusPorUuid(documentoUuid, statusNormalizado);
  if (!dealId) {
    log.aviso(`Webhook D4Sign recebido para documento ${documentoUuid}, mas nenhum dealId correspondente foi encontrado.`);
    return { ok: true, processado: false, motivo: 'documento_nao_encontrado' };
  }

  log.info(`Webhook D4Sign: documento ${documentoUuid} (Deal ${dealId}) mudou de status para ${statusNormalizado}`);

  // Se o contrato foi assinado por todos
  if (statusNormalizado === 'signed') {
    const stageSigned = config.bitrix.stageSigned || config.bitrix.estagios?.assinado || 'C20:WON';
    const dataAssinatura = agoraIso().slice(0, 10);

    try {
      await bitrixDeals.updateDealStage(dealId, stageSigned);
      // Registra a data de assinatura no campo oficial da AtlasGR
      const bitrixExtrator = require('./bitrixExtrator');
      await bitrixExtrator.atualizarDealNoBitrix(dealId, {
        stageId: stageSigned,
        dataAssinatura,
        comentario: `Contrato assinado digitalmente no D4Sign por todas as partes. Documento UUID: ${documentoUuid}`,
      });
    } catch (err) {
      log.erro('Falha ao mover deal para Ganho no Bitrix24 após assinatura D4Sign', { dealId, erro: err.message });
    }
  } else if (statusNormalizado === 'cancelled') {
    const stageCancelled = config.bitrix.stageCancelled || config.bitrix.estagios?.cancelado || 'C20:LOSE';
    try {
      await bitrixDeals.updateDealStage(dealId, stageCancelled);
      await bitrixDeals.addTimelineComment(dealId, `[Portal Financeiro AtlasGR] Contrato D4Sign (${documentoUuid}) foi cancelado/recusado.`);
    } catch (err) {
      log.erro('Falha ao mover deal para Perdido no Bitrix24 após cancelamento', { dealId, erro: err.message });
    }
  }

  return { ok: true, dealId, documentoUuid, status: statusNormalizado };
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
  buscarPreviaCampos,
  gerarEEnviarContrato,
  tratarEventoD4sign,
  listarDeals,
  listarLinks,
};
