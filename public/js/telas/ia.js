import { api, sessao } from '../nucleo/api.js';
import { h, limpar, carregando, icone, toast, etiqueta } from '../nucleo/ui.js';

function bolha(mensagem) {
  const deMim = mensagem.autor === 'eu';
  return h('div', {
      style: `display: flex; flex-direction: column; align-items: ${deMim ? 'flex-end' : 'flex-start'}; margin-bottom: 16px;`
    },
    h('div', {
        style: `font-size: 11px; margin-bottom: 4px; color: var(--texto-mudo);`
      },
      deMim ? 'Você' : 'Atlas IA'
    ),
    h('div', {
        class: `cartao ${deMim ? 'destaque' : ''}`,
        style: `max-width: 80%; padding: 12px 16px; border-radius: 8px; ${deMim ? 'background: var(--primaria); color: white;' : 'background: var(--fundo);'}`
      },
      mensagem.texto
    )
  );
}

export async function montar(ctx) {
  const raiz = h('div', { class: 'pilha' }, carregando());
  const permissoes = sessao().permissoes || {};
  let mensagens = [];
  let enviando = false;

  async function enviar(evento) {
    evento.preventDefault();
    if (enviando) return;

    const input = evento.target.elements.pergunta;
    const pergunta = input.value.trim();
    if (!pergunta) return;

    mensagens.push({ autor: 'eu', texto: pergunta });
    input.value = '';
    enviando = true;
    desenhar();

    try {
      const resposta = await api.post('/api/ia/perguntar', { pergunta });
      mensagens.push({ autor: 'ia', texto: resposta.texto });
    } catch (e) {
      toast(e.message, 'erro');
      mensagens.push({ autor: 'ia', texto: `Desculpe, ocorreu um erro: ${e.message}` });
    } finally {
      enviando = false;
      desenhar();
    }
  }

  function desenhar() {
    limpar(raiz);

    const historico = h('div', {
      style: 'flex: 1; overflow-y: auto; padding: 24px; background: white; border-radius: 8px; border: 1px solid var(--borda); margin-bottom: 16px; min-height: 400px; display: flex; flex-direction: column;'
    },
      mensagens.length === 0 ? h('div', { class: 'silencioso', style: 'text-align: center; margin: auto;' }, 'Faça uma pergunta sobre o financeiro, vendas ou estoque.') : null,
      ...mensagens.map(bolha),
      enviando ? h('div', { class: 'silencioso', style: 'margin-top: 16px;' }, 'Analisando...') : null
    );

    const form = h('form', { class: 'entre', style: 'gap: 8px;', onsubmit: enviar },
      h('input', { name: 'pergunta', placeholder: 'Ex: Qual foi a receita do mês passado?', style: 'flex: 1', autocomplete: 'off', disabled: enviando }),
      h('button', { type: 'submit', class: 'botao primaria', disabled: enviando }, 'Perguntar')
    );

    raiz.append(historico, form);

    // Rola para o fim
    if (historico.lastElementChild) historico.lastElementChild.scrollIntoView();
  }

  ctx.definirCabecalho({ titulo: 'Assistente de IA', subtitulo: 'Análise de dados e suporte por linguagem natural' });

  if (!mensagens.length) {
      mensagens.push({ autor: 'ia', texto: 'Olá! Sou o assistente de IA da Atlas. Como posso ajudar com os dados da empresa hoje?' });
  }

  desenhar();
  return raiz;
}
