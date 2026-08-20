import { api } from '../nucleo/api.js';
import {
  h, limpar, icone, toast, vazio, carregando, etiqueta, indicador, moeda, data,
} from '../nucleo/ui.js';

// ------------------------------------------------------------------
// DDA — Débito Direto Autorizado (boletos pendentes de pagamento).
// ------------------------------------------------------------------

export async function montar(ctx) {
  ctx.definirCabecalho({ titulo: 'DDA', subtitulo: 'Débito Direto Autorizado' });

  const area = h('div', {}, carregando());

  async function carregar() {
    limpar(area).append(carregando());
    try {
      const lancamentos = await api.get('/api/financeiro/dda');
      limpar(area);

      // Banner informativo
      area.append(h('div', { class: 'aviso info', style: 'margin-bottom:16px' },
        icone('alerta', 16),
        h('div', {},
          h('b', {}, 'DDA — Débito Direto Autorizado. '),
          'Boletos registrados para pagamento. Futuramente integrará com APIs bancárias.')));

      const totalPendente = lancamentos.reduce((s, l) => s + l.valor_centavos, 0);
      area.append(h('div', { class: 'indicadores' },
        indicador({ rotulo: 'Total pendente', valor: moeda(totalPendente), tom: 'alerta' }),
        indicador({ rotulo: 'Boletos', valor: String(lancamentos.length) })));

      if (!lancamentos.length) {
        area.append(h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' },
          vazio('Nenhum boleto pendente', 'Não há contas a pagar com status pendente.'))));
        return;
      }

      const corpo = h('tbody', {});
      for (const l of lancamentos) {
        corpo.append(h('tr', {},
          h('td', {}, l.descricao),
          h('td', {}, l.pessoa || '—'),
          h('td', { class: 'num' }, moeda(l.valor_centavos)),
          h('td', {}, data(l.data_vencimento)),
          h('td', {}, h('button', {
            class: 'botao secundario pequeno', type: 'button',
            onclick: async () => {
              try {
                await api.post(`/api/financeiro/lancamentos/${l.id}/pagar`);
                toast('Boleto pago.', 'ok');
                carregar();
              } catch (erro) {
                toast(erro.message, 'erro');
              }
            },
          }, 'Pagar'))));
      }

      area.append(h('div', { class: 'cartao' },
        h('div', { class: 'cartao-cabeca' }, h('h3', {}, 'Boletos DDA')),
        h('div', { class: 'cartao-corpo sem-espaco' },
          h('div', { class: 'tabela-envolve' },
            h('table', {},
              h('thead', {}, h('tr', {},
                h('th', {}, 'Descrição'), h('th', {}, 'Pessoa / Fornecedor'),
                h('th', { class: 'num' }, 'Valor'), h('th', {}, 'Vencimento'),
                h('th', {}, 'Ação'))),
              corpo)))));
    } catch (erro) {
      limpar(area).append(h('div', { class: 'aviso critico' }, icone('alerta', 16), h('div', {}, erro.message)));
    }
  }

  await carregar();
  return area;
}
