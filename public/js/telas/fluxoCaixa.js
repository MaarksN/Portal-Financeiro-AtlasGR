import { api, comQuery } from '../nucleo/api.js';
import {
  h, limpar, icone, vazio, carregando, etiqueta, indicador, moeda,
} from '../nucleo/ui.js';

// ------------------------------------------------------------------
// Fluxo de caixa — visão anual (12 meses) e projeção mensal
// ------------------------------------------------------------------

export async function montar(ctx) {
  ctx.definirCabecalho({
    titulo: 'Fluxo de Caixa',
    subtitulo: 'Acompanhamento de entradas, saídas, projeção e saldo acumulado',
  });

  const area = h('div', {}, carregando());

  let modoVisao = 'ano'; // 'ano' ou 'projecao'
  let anoSelecionado = new Date().getFullYear();
  let mesesProjecao = 6;

  async function carregar() {
    limpar(area).append(carregando());
    try {
      const params = modoVisao === 'ano'
        ? { ano: anoSelecionado }
        : { meses: mesesProjecao };

      const fluxo = await api.get(comQuery('/api/financeiro/fluxo-caixa', params));
      limpar(area);

      // Barra de Filtros & Controles
      const controles = h('div', {
        style: 'display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px;',
      },
        h('div', { style: 'display: flex; gap: 8px; align-items: center;' },
          h('span', { class: 'texto-suave', style: 'font-weight: 600;' }, 'Visualização:'),
          h('button', {
            type: 'button',
            class: `pilula-filtro ${modoVisao === 'ano' ? 'on' : ''}`,
            onclick: () => { modoVisao = 'ano'; carregar(); },
          }, `Ano Completo (${anoSelecionado})`),
          h('button', {
            type: 'button',
            class: `pilula-filtro ${modoVisao === 'projecao' ? 'on' : ''}`,
            onclick: () => { modoVisao = 'projecao'; carregar(); },
          }, 'Projeção Móvel')
        ),
        modoVisao === 'ano'
          ? h('div', { style: 'display: flex; gap: 6px; align-items: center;' },
              h('span', { class: 'texto-suave' }, 'Ano:'),
              ...[2024, 2025, 2026, 2027].map((a) => h('button', {
                type: 'button',
                class: `pilula-filtro ${a === anoSelecionado ? 'on' : ''}`,
                onclick: () => { anoSelecionado = a; carregar(); },
              }, String(a)))
            )
          : h('div', { style: 'display: flex; gap: 6px; align-items: center;' },
              h('span', { class: 'texto-suave' }, 'Horizonte:'),
              ...[3, 6, 12].map((n) => h('button', {
                type: 'button',
                class: `pilula-filtro ${n === mesesProjecao ? 'on' : ''}`,
                onclick: () => { mesesProjecao = n; carregar(); },
              }, `${n} meses`))
            )
      );

      area.append(controles);

      if (!fluxo || !fluxo.length) {
        area.append(h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' },
          vazio('Sem dados', 'Não há lançamentos financeiros para projetar o fluxo de caixa.'))));
        return;
      }

      // Totais e KPIs
      const totalRecPrev = fluxo.reduce((s, f) => s + (f.receitas_previstas || 0), 0);
      const totalDespPrev = fluxo.reduce((s, f) => s + (f.despesas_previstas || 0), 0);
      const totalRecReal = fluxo.reduce((s, f) => s + (f.receitas_realizadas || 0), 0);
      const totalDespReal = fluxo.reduce((s, f) => s + (f.despesas_realizadas || 0), 0);
      const saldoFinalReal = fluxo[fluxo.length - 1]?.saldo_acumulado_realizado || 0;
      const saldoFinalPrev = fluxo[fluxo.length - 1]?.saldo_acumulado_previsto || 0;

      area.append(h('div', { class: 'indicadores', style: 'margin-bottom: 16px;' },
        indicador({
          rotulo: 'Entradas Realizadas',
          valor: moeda(totalRecReal),
          subtexto: `Previsto: ${moeda(totalRecPrev)}`,
          tom: 'ok',
        }),
        indicador({
          rotulo: 'Saídas Realizadas',
          valor: moeda(totalDespReal),
          subtexto: `Previsto: ${moeda(totalDespPrev)}`,
          tom: 'critico',
        }),
        indicador({
          rotulo: 'Resultado Operacional Realizado',
          valor: moeda(totalRecReal - totalDespReal),
          tom: (totalRecReal - totalDespReal) >= 0 ? 'ok' : 'critico',
        }),
        indicador({
          rotulo: 'Saldo Final Acumulado',
          valor: moeda(saldoFinalReal),
          subtexto: `Projeção: ${moeda(saldoFinalPrev)}`,
          tom: saldoFinalReal >= 0 ? 'ok' : 'critico',
        })
      ));

      // Tabela do Fluxo de Caixa
      const corpo = h('tbody', {});
      for (const f of fluxo) {
        corpo.append(h('tr', {},
          h('td', { class: 'forte mono' }, f.mes),
          h('td', { class: 'num mono' }, moeda(f.receitas_previstas)),
          h('td', { class: 'num mono' }, moeda(f.despesas_previstas)),
          h('td', { class: 'num mono' },
            h('span', { style: `color:var(--${f.saldo_previsto >= 0 ? 'ok' : 'critico'})` },
              moeda(f.saldo_previsto))),
          h('td', { class: 'num mono' }, moeda(f.receitas_realizadas)),
          h('td', { class: 'num mono' }, moeda(f.despesas_realizadas)),
          h('td', { class: 'num mono' },
            h('span', { style: `color:var(--${f.saldo_realizado >= 0 ? 'ok' : 'critico'})` },
              moeda(f.saldo_realizado))),
          h('td', { class: 'num mono forte', style: 'background: rgba(0,0,0,0.02);' },
            h('span', { style: `color:var(--${(f.saldo_acumulado_realizado || 0) >= 0 ? 'ok' : 'critico'})` },
              moeda(f.saldo_acumulado_realizado || 0)))
        ));
      }

      // Linha de totalizadores
      const trTotais = h('tr', { class: 'forte', style: 'border-top: 2px solid var(--borda, #e5e7eb); background: rgba(0,0,0,0.03);' },
        h('td', {}, 'Total Período'),
        h('td', { class: 'num mono' }, moeda(totalRecPrev)),
        h('td', { class: 'num mono' }, moeda(totalDespPrev)),
        h('td', { class: 'num mono' },
          h('span', { style: `color:var(--${(totalRecPrev - totalDespPrev) >= 0 ? 'ok' : 'critico'})` },
            moeda(totalRecPrev - totalDespPrev))),
        h('td', { class: 'num mono' }, moeda(totalRecReal)),
        h('td', { class: 'num mono' }, moeda(totalDespReal)),
        h('td', { class: 'num mono' },
          h('span', { style: `color:var(--${(totalRecReal - totalDespReal) >= 0 ? 'ok' : 'critico'})` },
            moeda(totalRecReal - totalDespReal))),
        h('td', { class: 'num mono forte' }, moeda(saldoFinalReal))
      );
      corpo.append(trTotais);

      area.append(h('div', { class: 'cartao' },
        h('div', { class: 'cartao-cabeca' },
          h('h3', {}, modoVisao === 'ano' ? `Fluxo de Caixa Consolidado — ${anoSelecionado}` : `Projeção de Fluxo de Caixa — ${mesesProjecao} Meses`),
          h('span', { class: 'texto-suave' }, 'Entradas, saídas e saldo acumulado de caixa')
        ),
        h('div', { class: 'cartao-corpo sem-espaco' },
          h('div', { class: 'tabela-envolve', style: 'overflow-x: auto;' },
            h('table', { class: 'tabela' },
              h('thead', {}, h('tr', {},
                h('th', {}, 'Mês'),
                h('th', { class: 'num' }, 'Rec. Prev.'),
                h('th', { class: 'num' }, 'Desp. Prev.'),
                h('th', { class: 'num' }, 'Saldo Prev.'),
                h('th', { class: 'num' }, 'Rec. Real.'),
                h('th', { class: 'num' }, 'Desp. Real.'),
                h('th', { class: 'num' }, 'Saldo Real.'),
                h('th', { class: 'num', style: 'background: rgba(0,0,0,0.03);' }, 'Saldo Acumulado'))),
              corpo)))));
    } catch (erro) {
      limpar(area).append(h('div', { class: 'aviso critico' }, icone('alerta', 16), h('div', {}, erro.message)));
    }
  }

  await carregar();
  return area;
}
