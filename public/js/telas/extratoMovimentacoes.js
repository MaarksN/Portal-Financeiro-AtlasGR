import { api, comQuery } from '../nucleo/api.js';
import {
  h, limpar, icone, vazio, carregando, etiqueta, moeda, data, hoje,
} from '../nucleo/ui.js';

// ------------------------------------------------------------------
// Extrato de movimentações — visão consolidada de todos os lançamentos.
// ------------------------------------------------------------------

export async function montar(ctx) {
  ctx.definirCabecalho({ titulo: 'Extrato de movimentações', subtitulo: 'Todas as movimentações financeiras' });

  const area = h('div', {}, carregando());

  const agora = new Date();
  const mesAtual = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
  let filtroDe = `${mesAtual}-01`;
  let filtroAte = hoje();
  let filtroTipo = '';
  let filtroContaId = '';

  const contas = await api.get('/api/financeiro/contas');

  async function carregar() {
    limpar(area).append(carregando());
    try {
      const lancamentos = await api.get(comQuery('/api/financeiro/extrato-movimentacoes', {
        de: filtroDe, ate: filtroAte,
        tipo: filtroTipo || undefined,
        conta_id: filtroContaId || undefined,
      }));
      limpar(area);

      // Filtros
      const inputDe = h('input', { type: 'date', value: filtroDe, onchange: (e) => { filtroDe = e.target.value; } });
      const inputAte = h('input', { type: 'date', value: filtroAte, onchange: (e) => { filtroAte = e.target.value; } });
      const selectTipo = h('select', { onchange: (e) => { filtroTipo = e.target.value; } },
        h('option', { value: '' }, 'Todos os tipos'),
        h('option', { value: 'pagar', selected: filtroTipo === 'pagar' ? '' : null }, 'A pagar'),
        h('option', { value: 'receber', selected: filtroTipo === 'receber' ? '' : null }, 'A receber'));
      const selectConta = h('select', { onchange: (e) => { filtroContaId = e.target.value; } },
        h('option', { value: '' }, 'Todas as contas'),
        ...contas.map((c) => h('option', {
          value: String(c.id), selected: String(c.id) === filtroContaId ? '' : null,
        }, c.nome)));

      area.append(h('div', { class: 'linha-campos', style: 'margin-bottom:16px' },
        h('div', { class: 'campo' }, h('span', {}, 'De'), inputDe),
        h('div', { class: 'campo' }, h('span', {}, 'Até'), inputAte),
        h('div', { class: 'campo' }, h('span', {}, 'Tipo'), selectTipo),
        h('div', { class: 'campo' }, h('span', {}, 'Conta'), selectConta),
        h('div', { style: 'align-self:flex-end' },
          h('button', { class: 'botao secundario', type: 'button', onclick: carregar }, 'Filtrar'))));

      if (!lancamentos.length) {
        area.append(h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' },
          vazio('Nenhuma movimentação', 'Não há lançamentos no período selecionado.'))));
        return;
      }

      const corpo = h('tbody', {});
      for (const l of lancamentos) {
        corpo.append(h('tr', {},
          h('td', {}, data(l.data_vencimento)),
          h('td', {}, l.descricao),
          h('td', {}, l.conta_nome || '—'),
          h('td', {}, l.categoria_nome || '—'),
          h('td', {}, etiqueta(l.tipo === 'pagar' ? 'A pagar' : 'A receber', l.tipo === 'pagar' ? 'critico' : 'ok')),
          h('td', { class: 'num' }, moeda(l.valor_centavos)),
          h('td', {}, etiqueta(l.status === 'pago' ? 'Pago' : l.status === 'cancelado' ? 'Cancelado' : 'Pendente',
            l.status === 'pago' ? 'ok' : l.status === 'cancelado' ? 'neutro' : 'alerta'))));
      }

      area.append(h('div', { class: 'cartao' },
        h('div', { class: 'cartao-cabeca' }, h('h3', {}, 'Movimentações')),
        h('div', { class: 'cartao-corpo sem-espaco' },
          h('div', { class: 'tabela-envolve' },
            h('table', {},
              h('thead', {}, h('tr', {},
                h('th', {}, 'Data'), h('th', {}, 'Descrição'), h('th', {}, 'Conta'),
                h('th', {}, 'Categoria'), h('th', {}, 'Tipo'),
                h('th', { class: 'num' }, 'Valor'), h('th', {}, 'Status'))),
              corpo)))));
    } catch (erro) {
      limpar(area).append(h('div', { class: 'aviso critico' }, icone('alerta', 16), h('div', {}, erro.message)));
    }
  }

  await carregar();
  return area;
}
