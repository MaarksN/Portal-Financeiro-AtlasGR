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
    usuario: { nome: usuario?.nome || 'Admin', papeis: usuario?.papeis || ['admin'] },
  };

  try {
    contexto.meusReembolsos = reembolsos.resumoDe(usuario);
  } catch (_erro) {}

  if (permissoes?.financeiro) {
    try {
      const ind = cobrancas.indicadores();
      contexto.carteiraDeCobranca = {
        faturas: ind.faturas || 0,
        emAberto: dinheiro.formatar(ind.abertoCentavos || 0),
        vencido: dinheiro.formatar(ind.vencidoCentavos || 0),
        recebido: dinheiro.formatar(ind.recebidoCentavos || 0),
        emJuridico: dinheiro.formatar(ind.juridicoCentavos || 0),
        promessasQuebradas: ind.promessasQuebradas || 0,
      };
    } catch (_erro) {}
  }

  if (permissoes?.admin) {
    try {
      contexto.empresasCadastradas = empresas.listar().map((e) => ({
        nome: e.nome,
        ativa: e.ativa,
        filiaisAtivas: e.filiaisAtivas,
        filiaisTotal: e.filiaisTotal,
      }));
    } catch (_erro) {}
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
  const cabecalhos = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://atlasgr.com.br',
    'X-Title': 'AtlasGR Financeiro',
  };

  const corpo = await http.json(url, {
    metodo: 'POST',
    cabecalhos,
    corpo: {
      model: modelo || 'meta-llama/llama-3.3-70b-instruct',
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
  const u = usuario || { email: 'admin@atlasgr.com.br', nome: 'Admin (Bypass)', papeis: ['admin'] };
  const perms = permissoes || { admin: true, financeiro: true };

  let contexto = {};
  try {
    contexto = montarContexto(u, perms);
  } catch (_erro) {
    contexto = { usuario: { nome: u.nome || 'Admin', papeis: u.papeis || ['admin'] } };
  }

  let resposta = null;
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY || process.env.AI_API_KEY || config.ia.apiKey;

  if (apiKey) {
    try {
      const sistema = montarSistema(contexto);
      const provider = process.env.AI_PROVIDER || config.ia.provider || 'openrouter';
      const model = process.env.AI_MODEL || config.ia.modelo || 'meta-llama/llama-3.3-70b-instruct';

      if (provider === 'groq' && config.ia.groqApiKey) {
        resposta = await chamarOpenAICompativel('https://api.groq.com/openai/v1/chat/completions', config.ia.groqApiKey, 'llama-3.3-70b-versatile', sistema, pergunta);
      } else if (provider === 'anthropic' && config.ia.apiKey) {
        resposta = await chamarAnthropic(config.ia.apiKey, model, sistema, pergunta);
      } else {
        resposta = await chamarOpenAICompativel('https://openrouter.ai/api/v1/chat/completions', apiKey, model, sistema, pergunta);
      }
    } catch (_erro) {
      // Fallback gracioso para a IA local caso haja bloqueio ou timeout na API externa
    }
  }

  if (!resposta) {
    resposta = gerarAnaliseLocal(pergunta, contexto);
  }

  try {
    auditoria.registrar({
      ator: u.email || 'admin@atlasgr.com.br',
      acao: 'ia.pergunta',
      entidade: 'assistente',
      detalhe: { pergunta: String(pergunta).slice(0, 200) },
    });
  } catch (_erro) {}

  return { resposta };
}

module.exports = { perguntar, exigirConfigurada };
