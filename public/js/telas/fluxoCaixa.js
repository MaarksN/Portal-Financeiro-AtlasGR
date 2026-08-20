import { api, comQuery } from '../nucleo/api.js';
import {
  h, limpar, icone, vazio, carregando, etiqueta, indicador, moeda,
} from '../nucleo/ui.js';

// ------------------------------------------------------------------
// Fluxo de caixa — projeção e realizado por mês.
// ------------------------------------------------------------------

export async function montar(ctx) {
  ctx.definirCabecalho({ titulo: 'Fluxo de caixa', subtitulo: 'Projeção e realizado' });

  const area = h('div', {}, carregando());
  let meses = 6;

  async function carregar() {
    limpar(area).append(carregando());
    try {
      const fluxo = await api.get(comQuery('/api/financeiro/fluxo-caixa', { meses }));
      limpar(area);

      // Seletor de período
      area.append(h('div', { style: 'display:flex;gap:6px;margin-bottom:16px' },
        ...[3, 6, 12].map((n) => h('button', {
          class: `pilula-filtro ${n === meses ? 'on' : ''}`,
          type: 'button',
          onclick: () => { meses = n; carregar(); },
        }, `${n} meses`))));

      if (!fluxo.length) {
        area.append(h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' },
          vazio('Sem dados', 'Não há lançamentos para projetar o fluxo de caixa.'))));
        return;
      }

      // KPIs do primeiro mês
      const primeiro = fluxo[0];
      const totalReceber = fluxo.reduce((s, f) => s + f.receitas_previstas, 0);
      const totalPagar = fluxo.reduce((s, f) => s + f.despesas_previstas, 0);
      area.append(h('div', { class: 'indicadores' },
        indicador({
          rotulo: 'Saldo previsto (próx. mês)',
          valor: moeda(primeiro.saldo_previsto),
          tom: primeiro.saldo_previsto >= 0 ? 'ok' : 'critico',
        }),
        indicador({ rotulo: 'Total a receber', valor: moeda(totalReceber), tom: 'ok' }),
        indicador({ rotulo: 'Total a pagar', valor: moeda(totalPagar), tom: 'critico' })));

      // Tabela mensal
      const corpo = h('tbody', {});
      for (const f of fluxo) {
        corpo.append(h('tr', {},
          h('td', { class: 'forte' }, f.mes),
          h('td', { class: 'num' }, moeda(f.receitas_previstas)),
          h('td', { class: 'num' }, moeda(f.despesas_previstas)),
          h('td', { class: 'num' },
            h('span', { style: `color:var(--${f.saldo_previsto >= 0 ? 'ok' : 'critico'})` },
              moeda(f.saldo_previsto))),
          h('td', { class: 'num' }, moeda(f.receitas_realizadas)),
          h('td', { class: 'num' }, moeda(f.despesas_realizadas)),
          h('td', { class: 'num' },
            h('span', { style: `color:var(--${f.saldo_realizado >= 0 ? 'ok' : 'critico'})` },
              moeda(f.saldo_realizado)))));
      }

      area.append(h('div', { class: 'cartao' },
        h('div', { class: 'cartao-cabeca' }, h('h3', {}, 'Projeção mensal')),
        h('div', { class: 'cartao-corpo sem-espaco' },
          h('div', { class: 'tabela-envolve' },
            h('table', {},
              h('thead', {}, h('tr', {},
                h('th', {}, 'Mês'),
                h('th', { class: 'num' }, 'Receitas prev.'),
                h('th', { class: 'num' }, 'Despesas prev.'),
                h('th', { class: 'num' }, 'Saldo prev.'),
                h('th', { class: 'num' }, 'Receitas real.'),
                h('th', { class: 'num' }, 'Despesas real.'),
                h('th', { class: 'num' }, 'Saldo real.'))),
              corpo)))));
    } catch (erro) {
      limpar(area).append(h('div', { class: 'aviso critico' }, icone('alerta', 16), h('div', {}, erro.message)));
    }
  }

  await carregar();
  return area;
}
