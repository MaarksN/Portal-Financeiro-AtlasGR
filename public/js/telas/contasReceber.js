import { api, comQuery } from '../nucleo/api.js';
import {
  h, limpar, icone, toast, modal, campo, lerFormulario,
  vazio, carregando, etiqueta, indicador, moeda, data,
} from '../nucleo/ui.js';
import { botaoSalvar } from '../nucleo/exportar.js';
import { botaoAnaliseIA } from '../nucleo/analiseIA.js';

// ------------------------------------------------------------------
// Contas a receber — lançamentos tipo 'receber' com filtros.
// ------------------------------------------------------------------

function paraCentavos(valorTexto) {
  return Math.round(Number(String(valorTexto || '0').replace(',', '.')) * 100);
}

function abrirNovoContaReceber(aoSalvar) {
  const form = h('form', {},
    campo('Descrição', h('input', { type: 'text', name: 'descricao', required: true })),
    h('div', { class: 'linha-campos' },
      campo('Valor (R$)', h('input', { type: 'number', name: 'valor', step: '0.01', min: '0.01', required: true })),
      campo('Vencimento', h('input', { type: 'date', name: 'data_vencimento', required: true }))),
    campo('Cliente', h('input', { type: 'text', name: 'pessoa' })),
    campo('Observação', h('textarea', { name: 'observacao' })));

  modal({
    titulo: 'Nova conta a receber',
    corpo: form,
    acoes: [{
      rotulo: 'Lançar', estilo: 'sucesso',
      aoClicar: async (fechar) => {
        try {
          const dados = lerFormulario(form);
          await api.post('/api/financeiro/lancamentos', {
            tipo: 'receber',
            descricao: dados.descricao,
            valor_centavos: paraCentavos(dados.valor),
            data_vencimento: dados.data_vencimento,
            pessoa: dados.pessoa || null,
            observacao: dados.observacao || null,
          });
          fechar();
          toast('Conta a receber criada.', 'ok');
          aoSalvar();
        } catch (erro) {
          toast(erro.message, 'erro');
        }
      },
    }],
  });
}

export async function montar(ctx) {
  ctx.definirCabecalho({ titulo: 'Contas a receber' });

  const area = h('div', {}, carregando());
  let filtroAtual = '';

  async function carregar() {
    limpar(area).append(carregando());
    try {
      const resultado = await api.get(comQuery('/api/financeiro/contas-receber', { status: filtroAtual || undefined }));
      limpar(area);

      area.append(h('div', { class: 'indicadores' },
        indicador({ rotulo: 'Total pendente', valor: moeda(resultado.total_pendente), tom: 'alerta' }),
        indicador({ rotulo: 'Total recebido', valor: moeda(resultado.total_pago), tom: 'ok' }),
        indicador({ rotulo: 'Quantidade', valor: String(resultado.quantidade) })));

      ctx.definirCabecalho({
        titulo: 'Contas a receber',
        acoes: [
          botaoAnaliseIA('Contas a Receber', () => `Total pendente: R$ ${(resultado.total_pendente/100).toFixed(2)}\nTotal recebido: R$ ${(resultado.total_pago/100).toFixed(2)}\nQuantidade: ${resultado.quantidade}\nLançamentos pendentes: ${(resultado.lancamentos||[]).filter(l=>l.status==='pendente').length}`, area),
          botaoSalvar('contas-receber', () => ({ cabecalhos: ['Descrição', 'Cliente', 'Valor', 'Vencimento', 'Status'], linhas: (resultado.lancamentos||[]).map(l => [l.descricao, l.pessoa||'', (l.valor_centavos/100).toFixed(2), l.data_vencimento, l.status]) })),
          h('button', { class: 'botao', type: 'button', onclick: () => abrirNovoContaReceber(recarregar) }, icone('mais', 14), 'Novo'),
        ],
      });

      const filtros = h('div', { style: 'display:flex;gap:6px;margin-bottom:16px' },
        ...['', 'pendente', 'pago'].map((f) => h('button', {
          class: `pilula-filtro ${f === filtroAtual ? 'on' : ''}`,
          type: 'button',
          onclick: () => { filtroAtual = f; carregar(); },
        }, f === '' ? 'Todos' : f === 'pendente' ? 'Pendentes' : 'Recebidos')));
      area.append(filtros);

      const lancamentos = resultado.lancamentos || [];
      if (!lancamentos.length) {
        area.append(h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' },
          vazio('Nenhuma conta a receber', 'Não há registros para o filtro selecionado.'))));
        return;
      }

      const corpo = h('tbody', {});
      for (const l of lancamentos) {
        corpo.append(h('tr', {},
          h('td', {}, l.descricao),
          h('td', {}, l.pessoa || '—'),
          h('td', { class: 'num' }, moeda(l.valor_centavos)),
          h('td', {}, data(l.data_vencimento)),
          h('td', {}, etiqueta(l.status === 'pago' ? 'Recebido' : 'Pendente', l.status === 'pago' ? 'ok' : 'alerta')),
          h('td', {}, l.status === 'pendente' ? h('button', {
            class: 'botao secundario pequeno', type: 'button',
            onclick: async () => {
              try {
                await api.post(`/api/financeiro/lancamentos/${l.id}/pagar`);
                toast('Recebimento registrado.', 'ok');
                carregar();
              } catch (erro) {
                toast(erro.message, 'erro');
              }
            },
          }, 'Receber') : null)));
      }

      area.append(h('div', { class: 'cartao' },
        h('div', { class: 'cartao-corpo sem-espaco' },
          h('div', { class: 'tabela-envolve' },
            h('table', {},
              h('thead', {}, h('tr', {},
                h('th', {}, 'Descrição'), h('th', {}, 'Cliente'),
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
