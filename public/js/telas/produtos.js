import { api } from '../nucleo/api.js';
import {
  h, limpar, icone, toast, modal, campo, lerFormulario,
  vazio, carregando, moeda,
} from '../nucleo/ui.js';

// ------------------------------------------------------------------
// Catálogo de produtos. Lista simples com criação/edição em modal —
// mesmo padrão de telas/empresas.js.
// ------------------------------------------------------------------

function formularioProduto(produto) {
  return h('form', {},
    h('div', { class: 'linha-campos' },
      campo('Nome do produto', h('input', { type: 'text', name: 'nome', required: true, value: produto?.nome || '' })),
      campo('SKU', h('input', { type: 'text', name: 'sku', value: produto?.sku || '' }))),
    campo('Descrição', h('textarea', { name: 'descricao' }, produto?.descricao || '')),
    h('div', { class: 'linha-campos' },
      campo('Categoria', h('input', { type: 'text', name: 'categoria', value: produto?.categoria || '' })),
      campo('Marca', h('input', { type: 'text', name: 'marca', value: produto?.marca || '' })),
      campo('Unidade (ex.: UN, KG)', h('input', { type: 'text', name: 'unidade', value: produto?.unidade || '' }))),
    h('div', { class: 'linha-campos' },
      campo('Custo (R$)', h('input', {
        type: 'number', name: 'custo', step: '0.01', min: '0',
        value: produto ? (produto.custo_centavos / 100).toFixed(2) : '0.00',
      })),
      campo('Preço de venda (R$)', h('input', {
        type: 'number', name: 'preco', step: '0.01', min: '0', required: true,
        value: produto ? (produto.preco_centavos / 100).toFixed(2) : '0.00',
      }))));
}

function paraCentavos(valorTexto) {
  return Math.round(Number(String(valorTexto || '0').replace(',', '.')) * 100);
}

function abrirFormulario(produto, aoSalvar) {
  const form = formularioProduto(produto);
  modal({
    titulo: produto ? `Editar ${produto.nome}` : 'Novo produto',
    corpo: form,
    acoes: [{
      rotulo: produto ? 'Salvar' : 'Cadastrar',
      estilo: 'sucesso',
      aoClicar: async (fechar) => {
        try {
          const dados = lerFormulario(form);
          const payload = {
            nome: dados.nome,
            sku: dados.sku,
            descricao: dados.descricao,
            categoria: dados.categoria,
            marca: dados.marca,
            unidade: dados.unidade,
            custoCentavos: paraCentavos(dados.custo),
            precoCentavos: paraCentavos(dados.preco),
          };
          if (produto) await api.put(`/api/produtos/${produto.id}`, payload);
          else await api.post('/api/produtos', payload);
          fechar();
          toast(produto ? 'Produto atualizado.' : 'Produto cadastrado.', 'ok');
          aoSalvar();
        } catch (erro) {
          toast(erro.message, 'erro');
        }
      },
    }],
  });
}

export async function montar(ctx) {
  const raiz = h('div', {});
  const areaTabela = h('div', { class: 'cartao-corpo sem-espaco' }, carregando());

  const recarregar = async () => {
    const lista = await api.get('/api/produtos');

    if (!lista.length) {
      limpar(areaTabela).append(vazio('Nenhum produto cadastrado', 'Cadastre o primeiro produto do catálogo.'));
      return;
    }

    const corpo = h('tbody', {});
    for (const produto of lista) {
      corpo.append(h('tr', { class: 'clicavel', onclick: () => abrirFormulario(produto, recarregar) },
        h('td', {}, produto.sku || h('span', { class: 'silencioso' }, '—')),
        h('td', {}, h('div', { class: 'forte' }, produto.nome)),
        h('td', {}, produto.categoria || h('span', { class: 'silencioso' }, '—')),
        h('td', { class: 'num' }, moeda(produto.preco_centavos))));
    }

    limpar(areaTabela).append(h('div', { class: 'tabela-envolve' }, h('table', {},
      h('thead', {}, h('tr', {},
        h('th', {}, 'SKU'), h('th', {}, 'Nome'), h('th', {}, 'Categoria'), h('th', { class: 'num' }, 'Preço de venda'))),
      corpo)));
  };

  ctx.definirCabecalho({
    titulo: 'Produtos',
    subtitulo: 'Catálogo de produtos',
    acoes: [h('button', { class: 'botao', type: 'button', onclick: () => abrirFormulario(null, recarregar) },
      icone('mais'), 'Novo produto')],
  });

  raiz.append(h('div', { class: 'cartao' },
    h('div', { class: 'cartao-cabeca' }, h('h3', {}, 'Produtos cadastrados')), areaTabela));

  await recarregar();
  return raiz;
}
