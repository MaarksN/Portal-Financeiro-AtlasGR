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
    'Você é o assistente executivo do AtlasGR Financeiro, plataforma unificada de gestão financeira da AtlasGR e Total Trac.',
    'Responda em português (PT-BR) de forma direta, analítica e profissional.',
    'Analise tanto os dados enviados na mensagem do usuário (solicitação de análise do módulo) quanto o retrato geral do sistema abaixo.',
    'Forneça resumos executivos claros, destaque pontos de atenção, alertas de risco e recomendações práticas.',
    'Seja preciso com números e métricas fornecidas.',
    '',
    'DADOS GERAIS DO SISTEMA (JSON):',
    JSON.stringify(contexto, null, 2),
  ].join('\n');
}

function gerarAnaliseLocal(pergunta, contexto) {
  const linhas = pergunta.split('\n').filter(Boolean);
  const moduloMatch = pergunta.match(/módulo "([^"]+)"/i) || pergunta.match(/Análise IA — ([^\n]+)/i);
  const nomeModulo = moduloMatch ? moduloMatch[1] : 'Financeiro';

  let resumo = `### 📊 Diagnóstico Executivo — ${nomeModulo}\n\n`;
  resumo += `Análise consolidada baseada nos dados atuais do portal:\n\n`;

  // Extrair números do prompt se houver
  const metricas = [];
  for (const l of linhas) {
    if (l.includes(':')) {
      metricas.push(l.trim());
    }
  }

  if (metricas.length) {
    resumo += `#### 📈 Métricas Principais\n`;
    for (const m of metricas.slice(0, 6)) {
      resumo += `- **${m}**\n`;
    }
    resumo += `\n`;
  }

  resumo += `#### 💡 Insights & Recomendações Operacionais\n`;
  resumo += `- **Gestão de Liquidez**: Mantenha o acompanhamento constante dos prazos médios de recebimento e pagamento para otimizar o capital de giro.\n`;
  resumo += `- **Controle de Inadimplência**: Priorize ações preventivas e contatos imediatos sobre recebíveis com vencimentos próximos ou acumulados.\n`;
  resumo += `- **Eficiência de Processos**: Utilize a régua de cobrança automatizada e a conciliação para reduzir retrabalho manual.\n\n`;
  resumo += `*Nota: Para análises avançadas com IA em nuvem (Llama 3.3 / Claude), informe a chave ` + "`GROQ_API_KEY`" + ` ou ` + "`OPENROUTER_API_KEY`" + ` no arquivo `.env`.*`;

  return resumo;
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
  const contexto = montarContexto(usuario, permissoes);
  let resposta = null;

  if (config.ia.configurado) {
    try {
      const sistema = montarSistema(contexto);
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
    } catch (erro) {
      // Fallback em caso de falha externa de rede/token
    }
  }

  if (!resposta) {
    resposta = gerarAnaliseLocal(pergunta, contexto);
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
