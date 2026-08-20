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
      'Assistente de IA não configurado — informe GROQ_API_KEY, OPENROUTER_API_KEY ou AI_API_KEY no .env.',
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
    'Você é o assistente executivo do AtlasGR Financeiro, portal de gestão financeira, cobranças, contratos e reembolsos da AtlasGR e Total Trac.',
    'Responda SOMENTE com base nos dados reais abaixo, em português, de forma direta, clara e profissional.',
    'Nunca invente valor, nome ou número que não esteja neste retrato.',
    'Se a pergunta pedir algo que não está aqui, diga claramente que não há dado suficiente no portal para responder — não tente adivinhar.',
    'O retrato reflete só o que este usuário tem permissão de ver; não pressuponha acesso a mais do que isto.',
    '',
    'DADOS DISPONÍVEIS (JSON):',
    JSON.stringify(contexto, null, 2),
  ].join('\n');
}

async function chamarOpenAICompativel(url, apiKey, modelo, sistema, pergunta) {
  const corpo = await http.json(url, {
    metodo: 'POST',
    cabecalhos: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    corpo: {
      model: modelo,
      messages: [
        { role: 'system', content: sistema },
        { role: 'user', content: pergunta },
      ],
      max_tokens: 1500,
      temperature: 0.2,
    },
    timeoutMs: 30000,
    tentativas: 2,
    rotulo: 'assistente de IA',
  });

  return corpo?.choices?.[0]?.message?.content || null;
}

async function chamarAnthropic(apiKey, modelo, sistema, pergunta) {
  const corpo = await http.json('https://api.anthropic.com/v1/messages', {
    metodo: 'POST',
    cabecalhos: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    corpo: {
      model: modelo || 'claude-3-5-sonnet-20241022',
      max_tokens: 1500,
      system: sistema,
      messages: [{ role: 'user', content: pergunta }],
    },
    timeoutMs: 30000,
    tentativas: 2,
    rotulo: 'assistente de IA',
  });

  return corpo?.content?.find((bloco) => bloco.type === 'text')?.text || null;
}

async function perguntar({ pergunta, usuario, permissoes }) {
  exigirConfigurada();

  const contexto = montarContexto(usuario, permissoes);
  const sistema = montarSistema(contexto);
  let resposta = null;

  const provider = config.ia.provider || (config.ia.groqApiKey ? 'groq' : config.ia.openrouterApiKey ? 'openrouter' : 'anthropic');

  if (provider === 'groq' || config.ia.groqApiKey) {
    const key = config.ia.groqApiKey || config.ia.apiKey;
    const model = config.ia.modelo?.includes('llama') ? config.ia.modelo : 'llama-3.3-70b-versatile';
    resposta = await chamarOpenAICompativel('https://api.groq.com/openai/v1/chat/completions', key, model, sistema, pergunta);
  } else if (provider === 'openrouter' || config.ia.openrouterApiKey) {
    const key = config.ia.openrouterApiKey || config.ia.apiKey;
    const model = config.ia.modelo || 'meta-llama/llama-3.3-70b-instruct';
    resposta = await chamarOpenAICompativel('https://openrouter.ai/api/v1/chat/completions', key, model, sistema, pergunta);
  } else {
    resposta = await chamarAnthropic(config.ia.apiKey, config.ia.modelo, sistema, pergunta);
  }

  if (!resposta) {
    resposta = 'Não consegui montar uma resposta a partir dos dados disponíveis.';
  }

  auditoria.registrar({
    ator: usuario.email,
    acao: 'ia.pergunta',
    entidade: 'assistente',
    detalhe: { pergunta },
  });

  return { resposta };
}

module.exports = { perguntar, exigirConfigurada };
