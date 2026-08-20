'use strict';

const config = require('../config');
const http = require('./http');
const log = require('./log');
const { ErroApp } = require('./erros');
const { consultar, consultarUm, executar, emTransacao, agoraIso } = require('../db');

// ---------------------------------------------------------------------------
// Mapeamento de categorias e estágios conhecidos da AtlasGR
// (Confirmados via API e consistentes com Acompanhamentos-Atlasgr-Comercial)
// ---------------------------------------------------------------------------
const CATEGORIAS_PADRAO = [
  { id: '20', nome: '20 — Financeiro (Contratos & Cobrança)', focoFinanceiro: true },
  { id: '0',  nome: '0 — Comercial (Oportunidades & Ganhos)', focoFinanceiro: true },
  { id: '50', nome: '50 — Perfil Securitário', focoFinanceiro: true },
  { id: '44', nome: '44 — Financeiro (Reembolsos)', focoFinanceiro: true },
  { id: '3',  nome: '3 — Implantação', focoFinanceiro: false },
  { id: '5',  nome: '5 — Pós-Vendas', focoFinanceiro: false },
  { id: '46', nome: '46 — Sucesso do Cliente', focoFinanceiro: false },
  { id: '48', nome: '48 — Implantação Logística', focoFinanceiro: false },
  { id: '56', nome: '56 — Chamados SC', focoFinanceiro: false },
];

const ESTAGIOS_FINANCEIRO = {
  '20': [
    { code: '', label: 'Todos os estágios' },
    { code: 'C20:NEW', label: 'Análise de Documentos' },
    { code: 'C20:UC_JWY0OY', label: 'Piloto Atlas Profile' },
    { code: 'C20:UC_AM8GK1', label: 'Aguardando Assinatura (Piloto Profile)' },
    { code: 'C20:UC_I37148', label: 'Termo Aceito (Piloto Profile)' },
    { code: 'C20:UC_EU6LUO', label: 'Piloto Logístico' },
    { code: 'C20:UC_WBYFT4', label: 'Aguardando Assinatura (Piloto Logístico)' },
    { code: 'C20:UC_QT3CO8', label: 'Termo Aceito (Piloto Logístico)' },
    { code: 'C20:UC_H2J1XM', label: 'Aguardando Assinatura de Contrato' },
    { code: 'C20:WON', label: 'Contrato Assinado' },
    { code: 'C20:LOSE', label: 'Contrato Cancelado' },
  ],
  '0': [
    { code: '', label: 'Todos os estágios' },
    { code: 'UC_A0VPC5', label: 'Nova Oportunidade' },
    { code: 'NEW', label: 'Proposta Enviada' },
    { code: 'UC_5X3WZN', label: 'Call/Visita Agendada' },
    { code: 'UC_R1YAOS', label: 'Piloto' },
    { code: 'WON', label: 'Negócios Ganhos' },
    { code: 'LOSE', label: 'Negócios Perdidos' },
  ],
};

function extrairErro(corpo) {
  return corpo?.error_description || corpo?.error || null;
}

function obterWebhookUrl(origem = 'atlasgr') {
  if (origem === 'totaltrac' && config.bitrix?.totaltracWebhookUrl) {
    return config.bitrix.totaltracWebhookUrl;
  }
  return config.bitrix?.atlasgrWebhookUrl || config.bitrix?.webhookUrl || config.bitrix?.webhook;
}

function exigirConfiguracao(origem = 'atlasgr') {
  const url = obterWebhookUrl(origem);
  if (!url) {
    throw new ErroApp(`BITRIX_WEBHOOK (${origem}) não configurado no .env.`, {
      status: 503,
      codigo: 'bitrix_nao_configurado',
    });
  }
  return url.replace(/\/$/, '');
}

async function chamar(metodo, parametros = {}, origem = 'atlasgr') {
  const webhookUrl = exigirConfiguracao(origem);
  const corpo = await http.json(`${webhookUrl}/${metodo}.json`, {
    metodo: 'POST',
    corpo: parametros,
    rotulo: `Bitrix24 (${origem})`,
    extrairErro,
  });
  return corpo?.result;
}

async function listarPaginado(metodo, parametros = {}, { maximo = 5000, origem = 'atlasgr' } = {}) {
  const webhookUrl = exigirConfiguracao(origem);
  const resultados = [];
  const vistos = new Set();
  let start = 0;

  while (resultados.length < maximo) {
    const corpo = await http.json(`${webhookUrl}/${metodo}.json`, {
      metodo: 'POST',
      corpo: { ...parametros, start },
      rotulo: `Bitrix24 (${origem})`,
      extrairErro,
    });

    const lote = Array.isArray(corpo?.result) ? corpo.result : Object.values(corpo?.result || {});
    if (!lote.length) break;

    for (const item of lote) {
      const id = String(item?.ID || '');
      if (id && !vistos.has(id)) {
        vistos.add(id);
        resultados.push(item);
      }
    }

    if (corpo?.next === undefined || corpo?.next === null || lote.length < 50) break;
    start = corpo.next;
  }

  return resultados.slice(0, maximo);
}

// ---------------------------------------------------------------------------
// Listagem de Categorias e Estágios
// ---------------------------------------------------------------------------
async function listarCategorias(origem = 'atlasgr') {
  try {
    const categoriasBitrix = await chamar('crm.dealcategory.list', {}, origem);
    if (Array.isArray(categoriasBitrix) && categoriasBitrix.length > 0) {
      const mapeadas = [
        { id: '0', nome: '0 — Geral / Comercial' },
        ...categoriasBitrix.map((c) => ({ id: String(c.ID), nome: `${c.ID} — ${c.NAME}` })),
      ];
      return mapeadas;
    }
  } catch (err) {
    log.aviso(`Não foi possível listar categorias remotas do Bitrix: ${err.message}. Usando lista padrão.`);
  }
  return CATEGORIAS_PADRAO;
}

async function listarEstagios(categoriaId = '20', origem = 'atlasgr') {
  if (ESTAGIOS_FINANCEIRO[categoriaId]) {
    return ESTAGIOS_FINANCEIRO[categoriaId];
  }
  try {
    if (categoriaId === '0' || !categoriaId) {
      const status = await chamar('crm.status.list', { filter: { ENTITY_ID: 'DEAL_STAGE' } }, origem);
      if (Array.isArray(status)) {
        return [{ code: '', label: 'Todos os estágios' }, ...status.map((s) => ({ code: s.STATUS_ID, label: s.NAME }))];
      }
    } else {
      const status = await chamar('crm.dealcategory.stage.list', { id: categoriaId }, origem);
      if (Array.isArray(status)) {
        return [{ code: '', label: 'Todos os estágios' }, ...status.map((s) => ({ code: s.STATUS_ID, label: s.NAME }))];
      }
    }
  } catch (err) {
    log.aviso(`Não foi possível buscar estágios remotos da categoria ${categoriaId}: ${err.message}`);
  }
  return [{ code: '', label: 'Todos os estágios' }];
}

// ---------------------------------------------------------------------------
// Extração de Negócios / Deals do Bitrix com foco Financeiro & Contratos
// ---------------------------------------------------------------------------
async function extrairDeals({
  categoriaId = '20',
  estagioId = '',
  campoData = 'DATE_CREATE',
  dataInicio = '',
  dataFim = '',
  origem = 'atlasgr',
  limite = 2000,
} = {}) {
  const filtro = {};
  if (categoriaId !== '') filtro.CATEGORY_ID = categoriaId;
  if (estagioId) filtro.STAGE_ID = estagioId;

  if (dataInicio) filtro[`>=${campoData}`] = `${dataInicio}T00:00:00-03:00`;
  if (dataFim) filtro[`<=${campoData}`] = `${dataFim}T23:59:59-03:00`;

  const campos = [
    'ID', 'TITLE', 'STAGE_ID', 'CATEGORY_ID', 'OPPORTUNITY', 'CURRENCY_ID',
    'COMPANY_ID', 'CONTACT_ID', 'BEGINDATE', 'CLOSEDATE', 'DATE_CREATE',
    'DATE_MODIFY', 'MOVED_TIME', 'ASSIGNED_BY_ID', 'UF_CRM_1770928318695',
    'UF_CRM_CPF_CNPJ', 'UF_CRM_DIA_VENCIMENTO', 'UF_CRM_PLANO',
  ];

  log.info('Iniciando extração do Bitrix', { categoriaId, estagioId, campoData, dataInicio, dataFim, origem });

  const dealsBrutos = await listarPaginado('crm.deal.list', {
    filter: filtro,
    select: campos,
    order: { ID: 'DESC' },
  }, { maximo: limite, origem });

  // Coleta IDs de empresas e contatos para enriquecimento
  const companyIds = [...new Set(dealsBrutos.map((d) => d.COMPANY_ID).filter((id) => id && id !== '0'))];
  const contactIds = [...new Set(dealsBrutos.map((d) => d.CONTACT_ID).filter((id) => id && id !== '0'))];

  const empresasMap = new Map();
  const contatosMap = new Map();

  // Busca nomes das empresas em lote se houver
  if (companyIds.length > 0) {
    try {
      const empresas = await listarPaginado('crm.company.list', {
        filter: { '=ID': companyIds.slice(0, 500) },
        select: ['ID', 'TITLE', 'COMPANY_TYPE', 'INDUSTRY'],
      }, { maximo: 500, origem });
      empresas.forEach((e) => empresasMap.set(String(e.ID), e.TITLE));
    } catch (e) {
      log.aviso('Falha ao enriquecer empresas:', { erro: e.message });
    }
  }

  // Busca nomes dos contatos em lote se houver
  if (contactIds.length > 0) {
    try {
      const contatos = await listarPaginado('crm.contact.list', {
        filter: { '=ID': contactIds.slice(0, 500) },
        select: ['ID', 'NAME', 'LAST_NAME', 'EMAIL', 'PHONE'],
      }, { maximo: 500, origem });
      contatos.forEach((c) => {
        const nome = [c.NAME, c.LAST_NAME].filter(Boolean).join(' ') || `Contato ${c.ID}`;
        const email = c.EMAIL?.[0]?.VALUE || (typeof c.EMAIL === 'string' ? c.EMAIL : null);
        const telefone = c.PHONE?.[0]?.VALUE || (typeof c.PHONE === 'string' ? c.PHONE : null);
        contatosMap.set(String(c.ID), { nome, email, telefone });
      });
    } catch (e) {
      log.aviso('Falha ao enriquecer contatos:', { erro: e.message });
    }
  }

  // Formatação enriquecida
  let totalCentavos = 0;
  let totalGanhos = 0;
  let totalAbertos = 0;
  let totalComContrato = 0;

  const itens = dealsBrutos.map((d) => {
    const valorReais = Number(d.OPPORTUNITY) || 0;
    const valorCentavos = Math.round(valorReais * 100);
    totalCentavos += valorCentavos;

    const stage = String(d.STAGE_ID || '');
    const isGanho = stage.endsWith('WON') || stage === 'WON';
    const isPerdido = stage.endsWith('LOSE') || stage === 'LOSE';
    const isAberto = !isGanho && !isPerdido;

    if (isGanho) totalGanhos += 1;
    if (isAberto) totalAbertos += 1;

    const dataContratoAssinado = d.UF_CRM_1770928318695 || null;
    if (dataContratoAssinado || isGanho) totalComContrato += 1;

    const empresaNome = empresasMap.get(String(d.COMPANY_ID)) || null;
    const contatoInfo = contatosMap.get(String(d.CONTACT_ID)) || null;

    let statusContrato = 'em_andamento';
    if (isGanho || dataContratoAssinado) statusContrato = 'assinado';
    else if (stage.includes('H2J1XM') || stage.includes('AM8GK1') || stage.includes('WBYFT4')) statusContrato = 'aguardando_assinatura';
    else if (isPerdido) statusContrato = 'cancelado';

    return {
      dealId: String(d.ID),
      titulo: d.TITLE || `Deal ${d.ID}`,
      estagioId: stage,
      categoriaId: String(d.CATEGORY_ID || categoriaId),
      valorReais,
      valorCentavos,
      moeda: d.CURRENCY_ID || 'BRL',
      empresaId: d.COMPANY_ID && d.COMPANY_ID !== '0' ? String(d.COMPANY_ID) : null,
      empresaNome,
      contatoId: d.CONTACT_ID && d.CONTACT_ID !== '0' ? String(d.CONTACT_ID) : null,
      contatoNome: contatoInfo?.nome || null,
      contatoEmail: contatoInfo?.email || null,
      contatoTelefone: contatoInfo?.telefone || null,
      documento: d.UF_CRM_CPF_CNPJ || null,
      diaVencimento: d.UF_CRM_DIA_VENCIMENTO || '10',
      plano: d.UF_CRM_PLANO || null,
      dataCriacao: d.DATE_CREATE || null,
      dataModificacao: d.DATE_MODIFY || null,
      dataFechamento: d.CLOSEDATE || null,
      dataContratoAssinado,
      responsavelId: d.ASSIGNED_BY_ID || null,
      statusContrato,
      isGanho,
      isAberto,
      isPerdido,
    };
  });

  const totalRegistros = itens.length;
  const ticketMedioCentavos = totalRegistros > 0 ? Math.round(totalCentavos / totalRegistros) : 0;

  return {
    origem,
    categoriaId,
    totalRegistros,
    totalCentavos,
    ticketMedioCentavos,
    metricas: {
      totalGanhos,
      totalAbertos,
      totalComContrato,
      taxaAssinatura: totalRegistros > 0 ? Math.round((totalComContrato / totalRegistros) * 100) : 0,
    },
    itens,
  };
}

// ---------------------------------------------------------------------------
// Importação e Sincronização para o Banco de Dados Local
// ---------------------------------------------------------------------------
function importarParaFinanceiro(deals = []) {
  if (!Array.isArray(deals) || !deals.length) {
    return { novos: 0, atualizados: 0, total: 0 };
  }

  let novos = 0;
  let atualizados = 0;

  emTransacao(() => {
    for (const d of deals) {
      const existe = consultarUm('SELECT id FROM contratos_deals WHERE deal_id = ?', d.dealId);
      const clienteNome = d.empresaNome || d.contatoNome || d.titulo;

      executar(
        `INSERT INTO contratos_deals (
           deal_id, titulo, cliente_nome, cliente_email, cliente_documento,
           valor_centavos, moeda, plano, vencimento_dia, atualizado_em
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (deal_id) DO UPDATE SET
           titulo = excluded.titulo,
           cliente_nome = excluded.cliente_nome,
           cliente_email = excluded.cliente_email,
           cliente_documento = excluded.cliente_documento,
           valor_centavos = excluded.valor_centavos,
           moeda = excluded.moeda,
           plano = excluded.plano,
           vencimento_dia = excluded.vencimento_dia,
           atualizado_em = excluded.atualizado_em`,
        d.dealId,
        d.titulo,
        clienteNome,
        d.contatoEmail || null,
        d.documento || null,
        d.valorCentavos || 0,
        d.moeda || 'BRL',
        d.plano || null,
        d.diaVencimento || '10',
        agoraIso(),
      );

      if (existe) atualizados += 1;
      else novos += 1;

      // Se for um contrato assinado / ganho com valor > 0, sincroniza também na carteira de cobranças
      if (d.valorCentavos > 0 && (d.isGanho || d.statusContrato === 'assinado')) {
        const cobrancaExiste = consultarUm("SELECT id FROM cobrancas WHERE id_externo = ?", `DEAL-${d.dealId}`);
        const vencimento = d.dataFechamento ? d.dataFechamento.slice(0, 10) : agoraIso().slice(0, 10);
        const emissao = d.dataCriacao ? d.dataCriacao.slice(0, 10) : vencimento;

        if (!cobrancaExiste) {
          executar(
            `INSERT INTO cobrancas (
               origem, id_externo, documento, cliente_nome, cliente_doc,
               valor_centavos, valor_pago_centavos, emissao, vencimento,
               estagio, responsavel_email, status_origem, sincronizado_em
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            'bitrix',
            `DEAL-${d.dealId}`,
            `Contrato #${d.dealId}`,
            clienteNome,
            d.documento || null,
            d.valorCentavos,
            0,
            emissao,
            vencimento,
            'a_vencer',
            null,
            d.estagioId || 'Ganho',
            agoraIso(),
          );
        }
      }
    }
  })();

  log.info('Deals importados para o banco financeiro local', { total: deals.length, novos, atualizados });
  return { total: deals.length, novos, atualizados };
}

// ---------------------------------------------------------------------------
// Sincronização Reversa: Plataforma -> Bitrix24 (Bidirecional)
// ---------------------------------------------------------------------------
async function atualizarDealNoBitrix(dealId, {
  stageId = null,
  dataAssinatura = null,
  comentario = null,
  camposExtra = {},
  origem = 'atlasgr',
} = {}) {
  if (!dealId) throw new ErroApp('dealId é obrigatório para atualizar no Bitrix.', { status: 400 });

  const fields = { ...camposExtra };
  if (stageId) fields.STAGE_ID = stageId;
  if (dataAssinatura) fields.UF_CRM_1770928318695 = dataAssinatura;

  let resultadoUpdate = null;
  if (Object.keys(fields).length > 0) {
    resultadoUpdate = await chamar('crm.deal.update', { id: dealId, fields }, origem);
  }

  if (comentario) {
    await chamar('crm.timeline.comment.add', {
      fields: {
        ENTITY_ID: dealId,
        ENTITY_TYPE: 'deal',
        COMMENT: `[Portal Financeiro AtlasGR] ${comentario}`,
      },
    }, origem);
  }

  // Atualiza também no banco local para manter consistência imediata
  executar('UPDATE contratos_deals SET atualizado_em = ? WHERE deal_id = ?', agoraIso(), String(dealId));

  log.info(`Deal ${dealId} atualizado no Bitrix com sucesso`, { stageId, dataAssinatura, origem });
  return { ok: true, dealId, update: resultadoUpdate };
}

module.exports = {
  CATEGORIAS_PADRAO,
  ESTAGIOS_FINANCEIRO,
  listarCategorias,
  listarEstagios,
  extrairDeals,
  importarParaFinanceiro,
  atualizarDealNoBitrix,
  obterWebhookUrl,
};
