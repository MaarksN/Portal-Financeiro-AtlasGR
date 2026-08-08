'use strict';

const config = require('../config');
const http = require('./http');
const dinheiro = require('./dinheiro');
const auditoria = require('./auditoria');
const reembolsos = require('./reembolsos');
const cobrancas = require('./cobrancas');
const empresas = require('./empresas');
const { ErroApp } = require('./erros');

// ------------------------------------------------------------------
// Assistente de perguntas sobre os dados do portal. Não é um chat
// livre: cada pergunta monta um retrato real e atual do que o usuário
// tem permissão de ver (mesma regra da navegação, ver app.js/telas
// visíveis) e o modelo é instruído a responder só com base nisso —
// nunca inventar número que não esteja no retrato.
// ------------------------------------------------------------------

function exigirConfigurada() {
  if (!config.ia.configurado) {
    throw new ErroApp(
      'Assistente não configurado — falta ANTHROPIC_API_KEY no .env.',
      { status: 503, codigo: 'ia_nao_configurada' },
    );
  }
}

// Só o que o papel do usuário já enxerga em algum lugar do portal —
// mesma fronteira de permissão da navegação, não um recorte à parte.
function montarContexto(usuario, permissoes) {
  const contexto = {
    usuario: { nome: usuario.nome, papeis: usuario.papeis },
    meusReembolsos: reembolsos.resumoDe(usuario),
  };

  if (permissoes.financeiro) {
    const indicadores = cobrancas.indicadores();
    contexto.carteiraDeCobranca = {
      faturas: indicadores.faturas,
      emAberto: dinheiro.formatar(indicadores.aberto),
      vencido: dinheiro.formatar(indicadores.vencido),
      recebido: dinheiro.formatar(indicadores.recebido),
      emJuridico: dinheiro.formatar(indicadores.juridico),
      promessasQuebradas: indicadores.promessasQuebradas,
    };
  }

  if (permissoes.admin) {
    contexto.empresasCadastradas = empresas.listar().map((e) => ({
      nome: e.nome,
      ativa: e.ativa,
      filiaisAtivas: e.filiaisAtivas,
      filiaisTotal: e.filiaisTotal,
    }));
  }

  return contexto;
}

function montarSistema(contexto) {
  return [
    'Você é o assistente do AtlasGR Financeiro, portal interno de reembolso, cobranças e cadastros da AtlasGR.',
    'Responda SOMENTE com base nos dados reais abaixo, em português, de forma direta e curta.',
    'Nunca invente valor, nome ou número que não esteja neste retrato.',
    'Se a pergunta pedir algo que não está aqui, diga claramente que não há dado suficiente no portal para responder — não tente adivinhar.',
    'O retrato reflete só o que este usuário tem permissão de ver; não pressuponha acesso a mais do que isto.',
    '',
    'DADOS DISPONÍVEIS (JSON):',
    JSON.stringify(contexto, null, 2),
  ].join('\n');
}

async function perguntar({ pergunta, usuario, permissoes }) {
  exigirConfigurada();

  const contexto = montarContexto(usuario, permissoes);

  const corpo = await http.json('https://api.anthropic.com/v1/messages', {
    metodo: 'POST',
    cabecalhos: {
      'x-api-key': config.ia.apiKey,
      'anthropic-version': '2023-06-01',
    },
    corpo: {
      model: config.ia.modelo,
      max_tokens: 700,
      system: montarSistema(contexto),
      messages: [{ role: 'user', content: pergunta }],
    },
    timeoutMs: 30000,
    tentativas: 2,
    rotulo: 'assistente de IA',
  });

  const resposta = corpo?.content?.find((bloco) => bloco.type === 'text')?.text
    || 'Não consegui montar uma resposta a partir dos dados disponíveis.';

  auditoria.registrar({
    ator: usuario.email,
    acao: 'ia.pergunta',
    entidade: 'assistente',
    detalhe: { pergunta },
  });

  return { resposta };
}

module.exports = { perguntar, exigirConfigurada };
