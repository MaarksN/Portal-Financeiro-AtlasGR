import { h, limpar, toast, moeda, dataHora } from '../nucleo/ui.js';
import { api } from '../nucleo/api.js';

let configuracao = null;
let notasEmitidas = [];

function renderizarConfiguracao(ctx) {
  return h('form', {
    class: 'cartao fiscal-config',
    onsubmit: async (e) => {
      e.preventDefault();
      const ambiente = e.target.elements.ambiente.value;
      try {
        configuracao = await api.put('/api/fiscal/config', { ambiente });
        toast('Configurações fiscais atualizadas', 'sucesso');
      } catch (err) {
        toast(err.message, 'erro');
      }
    }
  },
    h('h3', {}, 'Configurações de Emissão (Simulado)'),
    h('label', {}, 'Ambiente'),
    h('select', { name: 'ambiente' },
      h('option', { value: 'homologacao', selected: configuracao?.ambiente === 'homologacao' }, 'Homologação (Sem valor fiscal)'),
      h('option', { value: 'producao', selected: configuracao?.ambiente === 'producao' }, 'Produção')
    ),
    h('div', { class: 'acoes' }, h('button', { type: 'submit', class: 'botao primario' }, 'Salvar Configuração'))
  );
}

function renderizarListaNotas() {
  const tbody = h('tbody');

  if (notasEmitidas.length === 0) {
    tbody.append(h('tr', {}, h('td', { colspan: 5, class: 'vazio' }, 'Nenhuma nota emitida ainda.')));
  } else {
    notasEmitidas.forEach(nota => {
      tbody.append(h('tr', {},
        h('td', {}, dataHora(nota.criado_em)),
        h('td', {}, nota.tipo.toUpperCase()),
        h('td', {}, nota.status),
        h('td', {}, nota.chave_acesso || '-'),
        h('td', {}, nota.origem_id)
      ));
    });
  }

  return h('div', { class: 'cartao' },
    h('h3', {}, 'Notas Fiscais Emitidas'),
    h('table', { class: 'tabela' },
      h('thead', {},
        h('tr', {},
          h('th', {}, 'Data'),
          h('th', {}, 'Tipo'),
          h('th', {}, 'Status'),
          h('th', {}, 'Chave de Acesso'),
          h('th', {}, 'ID Venda')
        )
      ),
      tbody
    )
  );
}

export async function montar(ctx) {
  ctx.definirCabecalho({ titulo: 'Módulo Fiscal' });

  try {
    configuracao = await api.get('/api/fiscal/config');
    notasEmitidas = await api.get('/api/fiscal/notas');
  } catch (err) {
    toast('Erro ao carregar dados fiscais: ' + err.message, 'erro');
  }

  const container = h('div', { class: 'fiscal-container' });

  container.append(renderizarConfiguracao(ctx));
  container.append(renderizarListaNotas());

  return container;
}
