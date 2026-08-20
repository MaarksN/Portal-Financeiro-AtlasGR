import { api, comQuery } from '../nucleo/api.js';
import {
  h, limpar, icone, vazio, carregando, etiqueta, moeda, data,
} from '../nucleo/ui.js';

// ------------------------------------------------------------------
// Histórico — operações finalizadas (pagas ou canceladas).
// ------------------------------------------------------------------

export async function montar(ctx) {
  ctx.definirCabecalho({ titulo: 'Histórico', subtitulo: 'Operações finalizadas' });

  const area = h('div', {}, carregando());
  let pagina = 1;
  let filtroTipo = '';
  let todosLancamentos = [];

  async function carregar(reset = false) {
    if (reset) {
      pagina = 1;
      todosLancamentos = [];
    }

    if (pagina === 1) limpar(area).append(carregando());

    try {
      const lancamentos = await api.get(comQuery('/api/financeiro/historico', {
        pagina, limite: 50, tipo: filtroTipo || undefined,
      }));

      if (pagina === 1) limpar(area);

      todosLancamentos = reset ? lancamentos : todosLancamentos.concat(lancamentos);

      if (pagina === 1) {
        // Filtros
        area.append(h('div', { style: 'display:flex;gap:6px;margin-bottom:16px' },
          ...['', 'pagar', 'receber'].map((f) => h('button', {
            class: `pilula-filtro ${f === filtroTipo ? 'on' : ''}`,
            type: 'button',
            onclick: () => { filtroTipo = f; carregar(true); },
          }, f === '' ? 'Todos' : f === 'pagar' ? 'A pagar' : 'A receber'))));
      }

      if (!todosLancamentos.length) {
        area.append(h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' },
          vazio('Nenhuma operação', 'Não há lançamentos finalizados.'))));
        return;
      }

      // Remover tabela anterior se paginando
      const tabelaAnterior = area.querySelector('.cartao-historico');
      if (tabelaAnterior) tabelaAnterior.remove();

      const corpo = h('tbody', {});
      for (const l of todosLancamentos) {
        corpo.append(h('tr', {},
          h('td', {}, data(l.atualizado_em || l.data_vencimento)),
          h('td', {}, l.descricao),
          h('td', {}, etiqueta(l.tipo === 'pagar' ? 'A pagar' : 'A receber', l.tipo === 'pagar' ? 'critico' : 'ok')),
          h('td', {}, l.conta_nome || '—'),
          h('td', {}, l.categoria_nome || '—'),
          h('td', {}, l.centro_custo_nome || '—'),
          h('td', { class: 'num' }, moeda(l.valor_pago_centavos || l.valor_centavos)),
          h('td', {}, etiqueta(l.status === 'pago' ? 'Pago' : 'Cancelado', l.status === 'pago' ? 'ok' : 'neutro'))));
      }

      const tabela = h('div', { class: 'cartao cartao-historico' },
        h('div', { class: 'cartao-cabeca' },
          h('h3', {}, `Histórico (${todosLancamentos.length} registros)`)),
        h('div', { class: 'cartao-corpo sem-espaco' },
          h('div', { class: 'tabela-envolve' },
            h('table', {},
              h('thead', {}, h('tr', {},
                h('th', {}, 'Data'), h('th', {}, 'Descrição'), h('th', {}, 'Tipo'),
                h('th', {}, 'Conta'), h('th', {}, 'Categoria'), h('th', {}, 'Centro custo'),
                h('th', { class: 'num' }, 'Valor'), h('th', {}, 'Status'))),
              corpo))));
      area.append(tabela);

      // Botão carregar mais (se veio 50 resultados, pode ter mais)
      if (lancamentos.length >= 50) {
        area.append(h('div', { style: 'text-align:center;margin-top:16px' },
          h('button', {
            class: 'botao secundario', type: 'button',
            onclick: () => { pagina++; carregar(false); },
          }, 'Carregar mais')));
      }
    } catch (erro) {
      limpar(area).append(h('div', { class: 'aviso critico' }, icone('alerta', 16), h('div', {}, erro.message)));
    }
  }

  await carregar(true);
  return area;
}
