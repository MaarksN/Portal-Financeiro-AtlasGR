import { api, comQuery } from '../nucleo/api.js';
import {
  h, limpar, icone, toast, vazio, carregando, etiqueta, indicador, moeda, data, hoje,
} from '../nucleo/ui.js';

// ------------------------------------------------------------------
// Extrato da Conta PJ — movimentações da conta corrente com saldo.
// ------------------------------------------------------------------

export async function montar(ctx) {
  ctx.definirCabecalho({ titulo: 'Extrato Conta PJ', subtitulo: 'Movimentações da conta corrente' });

  const area = h('div', {}, carregando());

  // Filtros padrão: mês atual
  const agora = new Date();
  const mesAtual = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
  let filtroContaId = '';
  let filtroDe = `${mesAtual}-01`;
  let filtroAte = hoje();

  const contas = await api.get('/api/financeiro/contas');
  const contasPJ = contas.filter((c) => c.tipo === 'corrente');

  if (contasPJ.length) filtroContaId = String(contasPJ[0].id);

  async function carregar() {
    limpar(area).append(carregando());
    try {
      if (!filtroContaId) {
        limpar(area).append(
          h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' },
            vazio('Nenhuma conta PJ', 'Cadastre uma conta corrente no módulo Financeiro.'))));
        return;
      }

      const resultado = await api.get(comQuery('/api/financeiro/extrato-pj', {
        conta_id: filtroContaId, de: filtroDe, ate: filtroAte,
      }));

      limpar(area);

      // Filtros
      const selectConta = h('select', {
        onchange: (e) => { filtroContaId = e.target.value; carregar(); },
      }, ...contasPJ.map((c) => h('option', {
        value: String(c.id), selected: String(c.id) === filtroContaId ? '' : null,
      }, `${c.nome} ${c.instituicao ? '— ' + c.instituicao : ''}`)));

      const inputDe = h('input', { type: 'date', value: filtroDe, onchange: (e) => { filtroDe = e.target.value; } });
      const inputAte = h('input', { type: 'date', value: filtroAte, onchange: (e) => { filtroAte = e.target.value; } });

      area.append(h('div', { class: 'linha-campos', style: 'margin-bottom:16px' },
        h('div', { class: 'campo' }, h('span', {}, 'Conta'), selectConta),
        h('div', { class: 'campo' }, h('span', {}, 'De'), inputDe),
        h('div', { class: 'campo' }, h('span', {}, 'Até'), inputAte),
        h('div', { style: 'align-self:flex-end' },
          h('button', { class: 'botao secundario', type: 'button', onclick: carregar }, 'Filtrar'))));

      // Info da conta
      area.append(h('div', { class: 'indicadores' },
        indicador({ rotulo: 'Conta', valor: resultado.conta.nome }),
        indicador({ rotulo: 'Instituição', valor: resultado.conta.instituicao || '—' }),
        indicador({ rotulo: 'Saldo atual', valor: moeda(resultado.saldo_atual), tom: resultado.saldo_atual >= 0 ? 'ok' : 'critico' })));

      const lancamentos = resultado.lancamentos || [];
      if (!lancamentos.length) {
        area.append(h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' },
          vazio('Nenhuma movimentação', 'Não há lançamentos no período selecionado.'))));
        return;
      }

      const corpo = h('tbody', {});
      for (const l of lancamentos) {
        const ehEntrada = l.tipo === 'receber';
        corpo.append(h('tr', {},
          h('td', {}, data(l.data_pagamento || l.data_vencimento)),
          h('td', {}, l.descricao),
          h('td', { class: 'num' }, ehEntrada ? moeda(l.valor_centavos) : '—'),
          h('td', { class: 'num' }, !ehEntrada ? moeda(l.valor_centavos) : '—'),
          h('td', { class: 'num' }, moeda(l.saldo_apos_lancamento))));
      }

      area.append(h('div', { class: 'cartao' },
        h('div', { class: 'cartao-cabeca' }, h('h3', {}, 'Movimentações')),
        h('div', { class: 'cartao-corpo sem-espaco' },
          h('div', { class: 'tabela-envolve' },
            h('table', {},
              h('thead', {}, h('tr', {},
                h('th', {}, 'Data'), h('th', {}, 'Descrição'),
                h('th', { class: 'num' }, 'Entrada'), h('th', { class: 'num' }, 'Saída'),
                h('th', { class: 'num' }, 'Saldo'))),
              corpo)))));
    } catch (erro) {
      limpar(area).append(h('div', { class: 'aviso critico' }, icone('alerta', 16), h('div', {}, erro.message)));
    }
  }

  await carregar();
  return area;
}
