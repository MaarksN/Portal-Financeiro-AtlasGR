import { api, comQuery } from '../nucleo/api.js';
import {
  h, limpar, icone, toast, modal, campo, lerFormulario, selecao,
  vazio, carregando, etiqueta, indicador, moeda, data,
} from '../nucleo/ui.js';

// ------------------------------------------------------------------
// Contas a pagar — lançamentos tipo 'pagar' com filtros e ações.
// ------------------------------------------------------------------

function paraCentavos(valorTexto) {
  return Math.round(Number(String(valorTexto || '0').replace(',', '.')) * 100);
}

function abrirNovoContaPagar(aoSalvar) {
  const form = h('form', {},
    campo('Descrição', h('input', { type: 'text', name: 'descricao', required: true })),
    h('div', { class: 'linha-campos' },
      campo('Valor (R$)', h('input', { type: 'number', name: 'valor', step: '0.01', min: '0.01', required: true })),
      campo('Vencimento', h('input', { type: 'date', name: 'data_vencimento', required: true }))),
    campo('Pessoa / Fornecedor', h('input', { type: 'text', name: 'pessoa' })),
    campo('Observação', h('textarea', { name: 'observacao' })));

  modal({
    titulo: 'Nova conta a pagar',
    corpo: form,
    acoes: [{
      rotulo: 'Lançar',
      estilo: 'sucesso',
      aoClicar: async (fechar) => {
        try {
          const dados = lerFormulario(form);
          await api.post('/api/financeiro/lancamentos', {
            tipo: 'pagar',
            descricao: dados.descricao,
            valor_centavos: paraCentavos(dados.valor),
            data_vencimento: dados.data_vencimento,
            pessoa: dados.pessoa || null,
            observacao: dados.observacao || null,
          });
          fechar();
          toast('Conta a pagar criada.', 'ok');
          aoSalvar();
        } catch (erro) {
          toast(erro.message, 'erro');
        }
      },
    }],
  });
}

export async function montar(ctx) {
  ctx.definirCabecalho({
    titulo: 'Contas a pagar',
    acoes: [
      h('button', {
        class: 'botao', type: 'button',
        onclick: () => abrirNovoContaPagar(recarregar),
      }, icone('mais', 14), 'Novo'),
    ],
  });

  const area = h('div', {}, carregando());
  let filtroAtual = '';

  async function carregar() {
    limpar(area).append(carregando());
    try {
      const resultado = await api.get(comQuery('/api/financeiro/contas-pagar', { status: filtroAtual || undefined }));

      limpar(area);

      area.append(h('div', { class: 'indicadores' },
        indicador({ rotulo: 'Total pendente', valor: moeda(resultado.total_pendente), tom: 'alerta' }),
        indicador({ rotulo: 'Total pago', valor: moeda(resultado.total_pago), tom: 'ok' }),
        indicador({ rotulo: 'Quantidade', valor: String(resultado.quantidade) })));

      // Filtros
      const filtros = h('div', { style: 'display:flex;gap:6px;margin-bottom:16px' },
        ...['', 'pendente', 'pago'].map((f) => h('button', {
          class: `pilula-filtro ${f === filtroAtual ? 'on' : ''}`,
          type: 'button',
          onclick: () => { filtroAtual = f; carregar(); },
        }, f === '' ? 'Todos' : f === 'pendente' ? 'Pendentes' : 'Pagos')));
      area.append(filtros);

      const lancamentos = resultado.lancamentos || [];
      if (!lancamentos.length) {
        area.append(h('div', { class: 'cartao' },
          h('div', { class: 'cartao-corpo' },
            vazio('Nenhuma conta a pagar', 'Não há registros para o filtro selecionado.'))));
        return;
      }

      const corpo = h('tbody', {});
      for (const l of lancamentos) {
        corpo.append(h('tr', {},
          h('td', {}, l.descricao),
          h('td', {}, l.pessoa || '—'),
          h('td', { class: 'num' }, moeda(l.valor_centavos)),
          h('td', {}, data(l.data_vencimento)),
          h('td', {}, etiqueta(l.status === 'pago' ? 'Pago' : 'Pendente', l.status === 'pago' ? 'ok' : 'alerta')),
          h('td', {}, l.status === 'pendente' ? h('button', {
            class: 'botao secundario pequeno', type: 'button',
            onclick: async () => {
              try {
                await api.post(`/api/financeiro/lancamentos/${l.id}/pagar`);
                toast('Conta baixada.', 'ok');
                carregar();
              } catch (erro) {
                toast(erro.message, 'erro');
              }
            },
          }, 'Baixar') : null)));
      }

      area.append(h('div', { class: 'cartao' },
        h('div', { class: 'cartao-corpo sem-espaco' },
          h('div', { class: 'tabela-envolve' },
            h('table', {},
              h('thead', {}, h('tr', {},
                h('th', {}, 'Descrição'), h('th', {}, 'Pessoa'),
                h('th', { class: 'num' }, 'Valor'), h('th', {}, 'Vencimento'),
                h('th', {}, 'Status'), h('th', {}, ''))),
              corpo)))));
    } catch (erro) {
      limpar(area).append(h('div', { class: 'aviso critico' }, icone('alerta', 16), h('div', {}, erro.message)));
    }
  }

  const recarregar = () => carregar();
  await carregar();
  return area;
}
