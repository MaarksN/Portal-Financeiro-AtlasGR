import { api } from '../nucleo/api.js';
import {
  h, limpar, icone, vazio, carregando, etiqueta, indicador, moeda, data, hoje,
} from '../nucleo/ui.js';

// ------------------------------------------------------------------
// Inadimplentes — contas a receber vencidas, agrupadas por pessoa.
// ------------------------------------------------------------------

export async function montar(ctx) {
  ctx.definirCabecalho({
    titulo: 'Inadimplentes',
    subtitulo: 'Beta',
    acoes: [etiqueta('Beta', 'info')],
  });

  const area = h('div', {}, carregando());

  async function carregar() {
    limpar(area).append(carregando());
    try {
      const resultado = await api.get('/api/financeiro/inadimplentes');
      limpar(area);

      area.append(h('div', { class: 'indicadores' },
        indicador({ rotulo: 'Total inadimplente', valor: moeda(resultado.total_centavos), tom: 'critico' }),
        indicador({ rotulo: 'Pessoas/empresas', valor: String(resultado.total_pessoas), tom: 'alerta' })));

      const inadimplentes = resultado.inadimplentes || [];
      if (!inadimplentes.length) {
        area.append(h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' },
          vazio('Nenhum inadimplente', 'Não há contas a receber vencidas.'))));
        return;
      }

      const hojeStr = hoje();
      for (const grupo of inadimplentes) {
        const detalhes = h('div', { class: 'nada' });

        const cartao = h('div', { class: 'cartao', style: 'margin-bottom:12px' },
          h('div', {
            class: 'cartao-cabeca', style: 'cursor:pointer',
            onclick: () => detalhes.classList.toggle('nada'),
          },
            h('h3', {}, grupo.pessoa),
            h('div', { class: 'acoes' },
              etiqueta(`${grupo.quantidade} título(s)`, 'alerta'),
              h('span', { class: 'forte', style: 'color:var(--critico)' }, moeda(grupo.total_centavos)))),
          detalhes);

        // Detalhes expandíveis
        const corpo = h('tbody', {});
        for (const l of grupo.lancamentos) {
          const dias = Math.floor((new Date(hojeStr) - new Date(l.data_vencimento)) / 86400000);
          const tom = dias > 30 ? 'critico' : 'alerta';
          corpo.append(h('tr', {},
            h('td', {}, l.descricao),
            h('td', { class: 'num' }, moeda(l.valor_centavos)),
            h('td', {}, data(l.data_vencimento)),
            h('td', {}, etiqueta(`${dias} dias`, tom))));
        }

        detalhes.append(h('div', { class: 'cartao-corpo sem-espaco' },
          h('div', { class: 'tabela-envolve' },
            h('table', {},
              h('thead', {}, h('tr', {},
                h('th', {}, 'Descrição'), h('th', { class: 'num' }, 'Valor'),
                h('th', {}, 'Vencimento'), h('th', {}, 'Atraso'))),
              corpo))));

        area.append(cartao);
      }
    } catch (erro) {
      limpar(area).append(h('div', { class: 'aviso critico' }, icone('alerta', 16), h('div', {}, erro.message)));
    }
  }

  await carregar();
  return area;
}
