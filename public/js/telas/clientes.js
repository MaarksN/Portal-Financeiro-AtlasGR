import { api } from '../nucleo/api.js';
import { h, limpar, moeda, carregando } from '../nucleo/ui.js';

export async function montar(raiz, contexto) {
  contexto.titulo('Clientes', 'Gestão de carteira de clientes');

  contexto.acoes(
    h('button', { class: 'botao primario', onclick: () => mostrarFormulario() }, 'Novo cliente')
  );

  const container = h('div', { class: 'tabela-container' });
  raiz.appendChild(container);

  async function carregar() {
    limpar(container);
    container.appendChild(carregando());
    try {
      const clientes = await api.get('/clientes');
      renderizarTabela(clientes);
    } catch (erro) {
      limpar(container);
      container.appendChild(h('div', { class: 'estado-vazio erro' }, erro.message));
    }
  }

  function renderizarTabela(clientes) {
    limpar(container);
    if (clientes.length === 0) {
      container.appendChild(h('div', { class: 'estado-vazio' }, 'Nenhum cliente cadastrado.'));
      return;
    }

    const tbody = h('tbody');
    clientes.forEach(cliente => {
      const tr = h('tr', { onclick: () => mostrarFormulario(cliente), style: 'cursor:pointer' },
        h('td', {}, cliente.nome),
        h('td', {}, cliente.documento || '-'),
        h('td', {}, cliente.email || '-'),
        h('td', {}, cliente.telefone || '-'),
        h('td', {}, moeda(cliente.limite_credito))
      );
      tbody.appendChild(tr);
    });

    const tabela = h('table', { class: 'tabela-dados' },
      h('thead', {},
        h('tr', {},
          h('th', {}, 'Nome'),
          h('th', {}, 'Documento'),
          h('th', {}, 'E-mail'),
          h('th', {}, 'Telefone'),
          h('th', {}, 'Limite de crédito')
        )
      ),
      tbody
    );
    container.appendChild(tabela);
  }

  function mostrarFormulario(cliente = null) {
    limpar(raiz);
    contexto.titulo(cliente ? 'Editar Cliente' : 'Novo Cliente');
    contexto.acoes(
      h('button', { class: 'botao fantasma', onclick: () => montar(raiz, contexto) }, 'Voltar')
    );

    const form = h('form', { class: 'formulario-padrao', onsubmit: async (e) => {
      e.preventDefault();
      const dados = {
        tipo: form.tipo.value,
        nome: form.nome.value,
        documento: form.documento.value,
        email: form.email.value,
        telefone: form.telefone.value,
        endereco: form.endereco.value,
        limiteCredito: Number(form.limiteCredito.value.replace(/\D/g, '')) || 0,
        vendedorEmail: form.vendedorEmail.value
      };

      try {
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = 'Salvando...';

        if (cliente) {
          await api.put(`/clientes/${cliente.id}`, dados);
        } else {
          await api.post('/clientes', dados);
        }
        montar(raiz, contexto);
      } catch (erro) {
        alert(erro.message);
        btn.disabled = false;
        btn.textContent = 'Salvar';
      }
    }});

    form.innerHTML = `
      <div class="campo">
        <label>Tipo</label>
        <select name="tipo" required>
          <option value="PF" ${cliente?.tipo === 'PF' ? 'selected' : ''}>Pessoa Física</option>
          <option value="PJ" ${cliente?.tipo === 'PJ' ? 'selected' : ''}>Pessoa Jurídica</option>
        </select>
      </div>
      <div class="campo">
        <label>Nome / Razão Social</label>
        <input type="text" name="nome" required value="${cliente?.nome || ''}">
      </div>
      <div class="campo">
        <label>Documento (CPF/CNPJ)</label>
        <input type="text" name="documento" value="${cliente?.documento || ''}">
      </div>
      <div class="linha-campos">
        <div class="campo">
          <label>E-mail</label>
          <input type="email" name="email" value="${cliente?.email || ''}">
        </div>
        <div class="campo">
          <label>Telefone</label>
          <input type="text" name="telefone" value="${cliente?.telefone || ''}">
        </div>
      </div>
      <div class="campo">
        <label>Endereço completo</label>
        <input type="text" name="endereco" value="${cliente?.endereco || ''}">
      </div>
      <div class="linha-campos">
        <div class="campo">
          <label>Limite de Crédito (R$)</label>
          <input type="text" name="limiteCredito" value="${cliente ? (cliente.limite_credito / 100).toFixed(2) : '0.00'}">
        </div>
        <div class="campo">
          <label>E-mail do Vendedor Responsável</label>
          <input type="email" name="vendedorEmail" value="${cliente?.vendedor_email || ''}">
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
