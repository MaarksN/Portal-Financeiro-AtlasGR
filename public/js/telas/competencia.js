import { api, comQuery } from '../nucleo/api.js';
import {
  h, limpar, icone, vazio, carregando, etiqueta, indicador, moeda, data, mesAnoExtenso,
} from '../nucleo/ui.js';
import { botaoSalvar } from '../nucleo/exportar.js';
import { botaoAnaliseIA } from '../nucleo/analiseIA.js';

// ------------------------------------------------------------------
// Visão de competência — receitas e despesas agrupadas por mês.
// ------------------------------------------------------------------

export async function montar(ctx) {
  ctx.definirCabecalho({ titulo: 'Visão de competência', subtitulo: 'Regime de competência por mês' });

  const area = h('div', {}, carregando());
  const agora = new Date();
  let mesSelecionado = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;

  async function carregar() {
    limpar(area).append(carregando());
    try {
      const resultado = await api.get(comQuery('/api/financeiro/competencia', { mes: mesSelecionado }));
      limpar(area);

      const lancamentos = resultado.lancamentos || [];

      ctx.definirCabecalho({
        titulo: 'Visão de competência',
        subtitulo: 'Regime de competência por mês',
        acoes: [
          botaoAnaliseIA('Competência', () => `Mês: ${mesSelecionado}\nReceitas: R$ ${(resultado.receitas_centavos/100).toFixed(2)}\nDespesas: R$ ${(resultado.despesas_centavos/100).toFixed(2)}\nResultado: R$ ${(resultado.resultado_centavos/100).toFixed(2)}\nLançamentos: ${lancamentos.length}`, area),
          botaoSalvar('competencia', () => ({ cabecalhos: ['Descrição', 'Tipo', 'Valor', 'Vencimento', 'Status'], linhas: lancamentos.map(l => [l.descricao, l.tipo, (l.valor_centavos/100).toFixed(2), l.data_vencimento, l.status]) })),
        ],
      });

      // Seletor de mês
      const inputMes = h('input', {
        type: 'month', value: mesSelecionado,
        onchange: (e) => { mesSelecionado = e.target.value; carregar(); },
      });
      area.append(h('div', { style: 'margin-bottom:16px' },
        h('div', { class: 'campo' }, h('span', {}, 'Mês de competência'), inputMes)));

      // Indicadores
      const resultadoTom = resultado.resultado_centavos >= 0 ? 'ok' : 'critico';
      area.append(h('div', { class: 'indicadores' },
        indicador({ rotulo: 'Receitas', valor: moeda(resultado.receitas_centavos), tom: 'ok' }),
        indicador({ rotulo: 'Despesas', valor: moeda(resultado.despesas_centavos), tom: 'critico' }),
        indicador({ rotulo: 'Resultado', valor: moeda(resultado.resultado_centavos), tom: resultadoTom })));

      if (!lancamentos.length) {
        area.append(h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' },
          vazio('Nenhum lançamento', 'Não há lançamentos para este mês de competência.'))));
        return;
      }

      const corpo = h('tbody', {});
      for (const l of lancamentos) {
        corpo.append(h('tr', {},
          h('td', {}, l.descricao),
          h('td', {}, etiqueta(l.tipo === 'pagar' ? 'Despesa' : 'Receita', l.tipo === 'pagar' ? 'critico' : 'ok')),
          h('td', { class: 'num' }, moeda(l.valor_centavos)),
          h('td', {}, data(l.data_vencimento)),
          h('td', {}, etiqueta(l.status === 'pago' ? 'Pago' : l.status === 'cancelado' ? 'Cancelado' : 'Pendente',
            l.status === 'pago' ? 'ok' : l.status === 'cancelado' ? 'neutro' : 'alerta'))));
      }

      area.append(h('div', { class: 'cartao' },
        h('div', { class: 'cartao-cabeca' }, h('h3', {}, `Lançamentos — ${mesAnoExtenso(mesSelecionado)}`)),
        h('div', { class: 'cartao-corpo sem-espaco' },
          h('div', { class: 'tabela-envolve' },
            h('table', {},
              h('thead', {}, h('tr', {},
                h('th', {}, 'Descrição'), h('th', {}, 'Tipo'),
                h('th', { class: 'num' }, 'Valor'), h('th', {}, 'Vencimento'),
                h('th', {}, 'Status'))),
              corpo)))));
    } catch (erro) {
      limpar(area).append(h('div', { class: 'aviso critico' }, icone('alerta', 16), h('div', {}, erro.message)));
    }
  }

  await carregar();
  return area;
}
