import { api } from '../nucleo/api.js';
import { h, limpar, moeda, carregando } from '../nucleo/ui.js';

export async function montar(raiz, contexto) {
  contexto.titulo('Produtos', 'Catálogo de produtos');

  contexto.acoes(
    h('button', { class: 'botao primario', onclick: () => mostrarFormulario() }, 'Novo produto')
  );

  const container = h('div', { class: 'tabela-container' });
  raiz.appendChild(container);

  async function carregar() {
    limpar(container);
    container.appendChild(carregando());
    try {
      const produtos = await api.get('/produtos');
      renderizarTabela(produtos);
    } catch (erro) {
      limpar(container);
      container.appendChild(h('div', { class: 'estado-vazio erro' }, erro.message));
    }
  }

  function renderizarTabela(produtos) {
    limpar(container);
    if (produtos.length === 0) {
      container.appendChild(h('div', { class: 'estado-vazio' }, 'Nenhum produto cadastrado.'));
      return;
    }

    const tbody = h('tbody');
    produtos.forEach(produto => {
      const tr = h('tr', { onclick: () => mostrarFormulario(produto), style: 'cursor:pointer' },
        h('td', {}, produto.sku || '-'),
        h('td', {}, produto.nome),
        h('td', {}, produto.categoria || '-'),
        h('td', {}, moeda(produto.preco_centavos))
      );
      tbody.appendChild(tr);
    });

    const tabela = h('table', { class: 'tabela-dados' },
      h('thead', {},
        h('tr', {},
          h('th', {}, 'SKU'),
          h('th', {}, 'Nome'),
          h('th', {}, 'Categoria'),
          h('th', {}, 'Preço de venda')
        )
      ),
      tbody
    );
    container.appendChild(tabela);
  }

  function mostrarFormulario(produto = null) {
    limpar(raiz);
    contexto.titulo(produto ? 'Editar Produto' : 'Novo Produto');
    contexto.acoes(
      h('button', { class: 'botao fantasma', onclick: () => montar(raiz, contexto) }, 'Voltar')
    );

    const form = h('form', { class: 'formulario-padrao', onsubmit: async (e) => {
      e.preventDefault();
      const dados = {
        nome: form.nome.value,
        sku: form.sku.value,
        descricao: form.descricao.value,
        categoria: form.categoria.value,
        marca: form.marca.value,
        unidade: form.unidade.value,
        custoCentavos: Number(form.custo.value.replace(/\D/g, '')) || 0,
        precoCentavos: Number(form.preco.value.replace(/\D/g, '')) || 0
      };

      try {
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = 'Salvando...';

        if (produto) {
          await api.put(`/produtos/${produto.id}`, dados);
        } else {
          await api.post('/produtos', dados);
        }
        montar(raiz, contexto);
      } catch (erro) {
        alert(erro.message);
        btn.disabled = false;
        btn.textContent = 'Salvar';
      }
    }});

    form.innerHTML = `
      <div class="linha-campos">
        <div class="campo">
          <label>Nome do Produto</label>
          <input type="text" name="nome" required value="${produto?.nome || ''}">
        </div>
        <div class="campo" style="max-width: 200px">
          <label>SKU</label>
          <input type="text" name="sku" value="${produto?.sku || ''}">
        </div>
      </div>
      <div class="campo">
        <label>Descrição</label>
        <textarea name="descricao" rows="3">${produto?.descricao || ''}</textarea>
      </div>
      <div class="linha-campos">
        <div class="campo">
          <label>Categoria</label>
          <input type="text" name="categoria" value="${produto?.categoria || ''}">
        </div>
        <div class="campo">
          <label>Marca</label>
          <input type="text" name="marca" value="${produto?.marca || ''}">
        </div>
        <div class="campo" style="max-width: 150px">
          <label>Unidade (ex: UN, KG)</label>
          <input type="text" name="unidade" value="${produto?.unidade || ''}">
        </div>
      </div>
      <div class="linha-campos">
        <div class="campo">
          <label>Custo (R$)</label>
          <input type="text" name="custo" required value="${produto ? (produto.custo_centavos / 100).toFixed(2) : '0.00'}">
        </div>
        <div class="campo">
          <label>Preço de Venda (R$)</label>
          <input type="text" name="preco" required value="${produto ? (produto.preco_centavos / 100).toFixed(2) : '0.00'}">
        </div>
      </div>
      <div class="acoes-form">
        <button type="submit" class="botao primario">Salvar</button>
      </div>
    `;

    raiz.appendChild(form);
  }

  carregar();
}
