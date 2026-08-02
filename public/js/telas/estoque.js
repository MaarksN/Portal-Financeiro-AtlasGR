import { api, comQuery } from '../nucleo/api.js';
import {
  h, limpar, icone, toast, modal, confirmar, campo, selecao, lerFormulario,
  data, dataHora, vazio, carregando, etiqueta, indicador,
} from '../nucleo/ui.js';

async function montar(contexto) {
  const { definirCabecalho, recarregar } = contexto;
  definirCabecalho({
    titulo: 'Estoque (Initial operational views)',
    acoes: [
      h('button', { class: 'botao', type: 'button', onclick: () => toast('Função não implementada.', 'info') }, icone('mais'), 'Movimentar'),
    ],
  });

  const raiz = h('div');

  // Listar Estoque
  const resEstoque = await api.get('/api/estoque/posicoes');
  const tabelaEstoque = resEstoque.length === 0
    ? vazio('Estoque vazio.', icone('fonte', 48))
    : h('table', { class: 'tabela' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Local'), h('th', {}, 'Produto'), h('th', {}, 'Quantidade'), h('th', {}, 'UN'))),
        h('tbody', {}, ...resEstoque.map((e) => h('tr', {},
          h('td', {}, e.local_nome),
          h('td', {}, e.produto_nome),
          h('td', {}, String(e.quantidade)),
          h('td', {}, e.unidade_medida)
        )))
      );

  raiz.append(
    h('div', { class: 'cartao' },
      h('div', { class: 'cartao-cabeca' }, h('h3', {}, 'Posições de Estoque')),
      h('div', { class: 'cartao-corpo' }, tabelaEstoque)
    )
  );

  return raiz;
}

export { montar };
