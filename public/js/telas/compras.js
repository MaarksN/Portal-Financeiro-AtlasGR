import { api, comQuery } from '../nucleo/api.js';
import {
  h, limpar, icone, toast, modal, confirmar, campo, selecao, lerFormulario,
  data, dataHora, vazio, carregando, etiqueta, indicador,
} from '../nucleo/ui.js';

async function montar(contexto) {
  const { definirCabecalho, recarregar } = contexto;
  definirCabecalho({
    titulo: 'Compras (Initial operational views)',
    acoes: [
      h('button', { class: 'botao', type: 'button', onclick: () => toast('Função não implementada.', 'info') }, icone('mais'), 'Nova Solicitação'),
    ],
  });

  const raiz = h('div');

  // Listar Fornecedores
  const resFornecedores = await api.get('/api/compras/fornecedores');
  const tabelaFornecedores = resFornecedores.length === 0
    ? vazio('Nenhum fornecedor cadastrado.', icone('fonte', 48))
    : h('table', { class: 'tabela' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Razão Social'), h('th', {}, 'Documento'), h('th', {}, 'E-mail'))),
        h('tbody', {}, ...resFornecedores.map((f) => h('tr', {},
          h('td', {}, f.razao_social),
          h('td', {}, f.documento),
          h('td', {}, f.email)
        )))
      );

  raiz.append(
    h('div', { class: 'cartao' },
      h('div', { class: 'cartao-cabeca' }, h('h3', {}, 'Fornecedores')),
      h('div', { class: 'cartao-corpo' }, tabelaFornecedores)
    )
  );

  return raiz;
}

export { montar };
