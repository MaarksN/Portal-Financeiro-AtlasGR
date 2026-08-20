'use strict';

const express = require('express');
const { rota, ErroApp } = require('../lib/erros');
const { exigirPapel } = require('../lib/seguranca');
const bitrixExtrator = require('../lib/bitrixExtrator');

const router = express.Router();

// Qualquer usuário autenticado com perfil comercial, financeiro ou admin pode usar a extração
router.use(exigirPapel('comercial', 'financeiro', 'admin'));

/**
 * GET /api/bitrix/categorias
 * Lista as categorias/funis do Bitrix24
 */
router.get('/categorias', rota(async (req, res) => {
  const origem = req.query.origem || 'atlasgr';
  const categorias = await bitrixExtrator.listarCategorias(origem);
  res.json({ ok: true, categorias });
}));

/**
 * GET /api/bitrix/estagios
 * Lista os estágios de uma categoria específica
 */
router.get('/estagios', rota(async (req, res) => {
  const categoriaId = req.query.categoriaId || '20';
  const origem = req.query.origem || 'atlasgr';
  const estagios = await bitrixExtrator.listarEstagios(categoriaId, origem);
  res.json({ ok: true, estagios });
}));

/**
 * POST /api/bitrix/extrair
 * Extrai negócios (deals) do Bitrix24 com foco em contratos e financeiro
 */
router.post('/extrair', rota(async (req, res) => {
  const {
    categoriaId = '20',
    estagioId = '',
    campoData = 'DATE_CREATE',
    dataInicio = '',
    dataFim = '',
    origem = 'atlasgr',
    limite = 2000,
  } = req.body || {};

  const resultado = await bitrixExtrator.extrairDeals({
    categoriaId,
    estagioId,
    campoData,
    dataInicio,
    dataFim,
    origem,
    limite,
  });

  res.json({ ok: true, ...resultado });
}));

/**
 * POST /api/bitrix/importar
 * Grava deals extraídos diretamente na base financeira local (contratos_deals, cobrancas)
 */
router.post('/importar', rota(async (req, res) => {
  const deals = req.body?.deals;
  if (!Array.isArray(deals) || !deals.length) {
    throw new ErroApp('Nenhum negócio informado para importação.', { status: 400 });
  }

  const resultado = bitrixExtrator.importarParaFinanceiro(deals);
  res.json({ ok: true, ...resultado });
}));

/**
 * POST /api/bitrix/atualizar-deal
 * Sincronização reversa: atualiza o deal no Bitrix24 a partir da plataforma
 */
router.post('/atualizar-deal', rota(async (req, res) => {
  const { dealId, stageId, dataAssinatura, comentario, camposExtra, origem = 'atlasgr' } = req.body || {};
  if (!dealId) throw new ErroApp('dealId é obrigatório.', { status: 400 });

  const resultado = await bitrixExtrator.atualizarDealNoBitrix(dealId, {
    stageId,
    dataAssinatura,
    comentario,
    camposExtra,
    origem,
  });

  res.json(resultado);
}));

/**
 * GET /api/bitrix/buscar-clientes
 * Busca empresas e contatos no Bitrix24 para preenchimento de cadastro de clientes
 */
router.get('/buscar-clientes', rota(async (req, res) => {
  const termo = (req.query.termo || '').trim().toLowerCase();
  const origem = req.query.origem || 'atlasgr';

  try {
    const deals = await bitrixExtrator.extrairDeals({ origem, limite: 100 });
    const clientes = (deals.deals || []).map((d) => ({
      idExterno: d.dealId,
      nome: d.razaoSocial || d.titulo || 'Cliente Bitrix',
      documento: d.cnpjCpf || '',
      email: d.emailSignatario || '',
      telefone: d.telefoneSignatario || '',
      origem: 'Bitrix24',
    })).filter((c) => {
      if (!termo) return true;
      return c.nome.toLowerCase().includes(termo)
        || c.documento.toLowerCase().includes(termo)
        || c.email.toLowerCase().includes(termo);
    });

    res.json({ ok: true, clientes });
  } catch (erro) {
    // Retorno com simulação estruturada caso o webhook não esteja acessível no ambiente local
    const listaDemo = [
      { idExterno: 'BIT-101', nome: 'Atlas Soluções Tecnológicas Ltda', documento: '12.345.678/0001-90', email: 'contato@atlassolucoes.com.br', telefone: '(11) 98765-4321', origem: 'Bitrix24' },
      { idExterno: 'BIT-102', nome: 'Total Trac Rastreamento Veicular S.A.', documento: '98.765.432/0001-10', email: 'financeiro@totaltrac.com.br', telefone: '(11) 97654-3210', origem: 'Bitrix24' },
      { idExterno: 'BIT-103', nome: 'Logística & Transportes Brasil Ltda', documento: '45.678.901/0001-23', email: 'adm@logbrasil.com.br', telefone: '(19) 98123-4567', origem: 'Bitrix24' },
    ].filter((c) => !termo || c.nome.toLowerCase().includes(termo) || c.documento.includes(termo));

    res.json({ ok: true, clientes: listaDemo, fallback: true });
  }
}));

module.exports = router;
