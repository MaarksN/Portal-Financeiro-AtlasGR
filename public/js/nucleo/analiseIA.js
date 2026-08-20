// Componente reutilizável de análise com IA.
// Exibe um botão "Analisar com IA" que envia dados contextuais
// do módulo para o assistente e mostra a resposta num painel expansível.

import { api } from './api.js';
import { h, limpar, icone, toast, carregando } from './ui.js';

/**
 * Cria um botão "Analisar com IA" para a barra de ações do cabeçalho.
 * Ao clicar, insere um painel de análise abaixo da área principal.
 *
 * @param {string} modulo - Nome do módulo (ex: 'DRE', 'Fluxo de Caixa').
 * @param {() => string} obterContexto - Função que retorna o texto com os dados
 *   a serem analisados (indicadores, tabelas resumidas, etc.).
 * @param {HTMLElement} areaAlvo - Container onde o painel de resposta será inserido.
 * @returns {HTMLElement} Botão pronto para inserir no DOM.
 */
export function botaoAnaliseIA(modulo, obterContexto, areaAlvo) {
  let painelAtivo = null;

  return h('button', {
    class: 'botao', type: 'button',
    onclick: async () => {
      if (painelAtivo) {
        painelAtivo.remove();
        painelAtivo = null;
        return;
      }

      const contexto = obterContexto();
      if (!contexto) {
        toast('Nenhum dado disponível para análise.', 'alerta');
        return;
      }

      const pergunta = `Analise os seguintes dados do módulo "${modulo}" do Portal Financeiro AtlasGR e forneça insights, alertas e recomendações:\n\n${contexto}`;

      const painel = h('div', {
        class: 'cartao',
        style: 'margin-top: 16px; border-left: 4px solid var(--primaria, #3b82f6);',
      },
        h('div', { class: 'cartao-cabeca', style: 'display:flex;justify-content:space-between;align-items:center' },
          h('h3', { style: 'display:flex;align-items:center;gap:8px' },
            h('span', { style: 'font-size:18px' }, '🤖'),
            `Análise IA — ${modulo}`),
          h('button', {
            class: 'btn discreto', type: 'button',
            title: 'Fechar análise',
            onclick: () => { painel.remove(); painelAtivo = null; },
          }, '✕')),
        h('div', { class: 'cartao-corpo ia-resposta' }, carregando()));

      painelAtivo = painel;

      if (areaAlvo.firstElementChild) {
        areaAlvo.insertBefore(painel, areaAlvo.firstElementChild);
      } else {
        areaAlvo.append(painel);
      }

      try {
        const resultado = await api.post('/api/ia/perguntar', { pergunta });
        const corpo = painel.querySelector('.ia-resposta');
        if (corpo) {
          limpar(corpo);
          // Renderizar resposta com formatação básica de markdown
          const blocos = (resultado.resposta || 'Sem resposta.').split('\n');
          for (const bloco of blocos) {
            if (!bloco.trim()) {
              corpo.append(h('br', {}));
              continue;
            }
            // Cabeçalhos
            if (bloco.startsWith('### ')) {
              corpo.append(h('h5', { style: 'margin:12px 0 4px;color:var(--primaria,#3b82f6)' }, bloco.slice(4)));
            } else if (bloco.startsWith('## ')) {
              corpo.append(h('h4', { style: 'margin:12px 0 4px;color:var(--primaria,#3b82f6)' }, bloco.slice(3)));
            } else if (bloco.startsWith('# ')) {
              corpo.append(h('h3', { style: 'margin:12px 0 4px' }, bloco.slice(2)));
            } else if (bloco.startsWith('- ') || bloco.startsWith('• ')) {
              corpo.append(h('div', { style: 'padding-left:16px;margin:2px 0' },
                h('span', { style: 'color:var(--primaria,#3b82f6);margin-right:6px' }, '•'),
                bloco.slice(2)));
            } else if (bloco.startsWith('**') && bloco.endsWith('**')) {
              corpo.append(h('p', { style: 'margin:6px 0' }, h('strong', {}, bloco.slice(2, -2))));
            } else {
              corpo.append(h('p', { style: 'margin:4px 0;line-height:1.6' }, bloco));
            }
          }
        }
      } catch (erro) {
        const corpo = painel.querySelector('.ia-resposta');
        if (corpo) {
          limpar(corpo).append(
            h('div', { class: 'aviso critico' },
              icone('alerta', 16),
              h('div', {}, 'Não foi possível obter a análise: ', erro.message)));
        }
      }
    },
  }, h('span', { style: 'font-size:14px' }, '🤖'), ' Analisar com IA');
}
