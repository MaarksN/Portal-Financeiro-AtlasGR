import { api } from '../nucleo/api.js';
import {
  h, limpar, icone, toast, modal, campo, lerFormulario, selecao,
  vazio, carregando, moeda, etiqueta,
} from '../nucleo/ui.js';

// ------------------------------------------------------------------
// Carteira de clientes. Mesma estrutura de telas/produtos.js.
// ------------------------------------------------------------------

function formularioCliente(cliente) {
  return h('form', {},
    campo('Tipo', selecao('tipo', [
      { valor: 'PF', rotulo: 'Pessoa física' },
      { valor: 'PJ', rotulo: 'Pessoa jurídica' },
    ], cliente?.tipo || 'PJ')),
    campo('Nome / razão social', h('input', { type: 'text', name: 'nome', required: true, value: cliente?.nome || '' })),
    campo('Documento (CPF/CNPJ)', h('input', { type: 'text', name: 'documento', value: cliente?.documento || '' })),
    h('div', { class: 'linha-campos' },
      campo('E-mail', h('input', { type: 'email', name: 'email', value: cliente?.email || '' })),
      campo('Telefone', h('input', { type: 'text', name: 'telefone', value: cliente?.telefone || '' }))),
    campo('Endereço completo', h('input', { type: 'text', name: 'endereco', value: cliente?.endereco || '' })),
    h('div', { class: 'linha-campos' },
      campo('Limite de crédito (R$)', h('input', {
        type: 'number', name: 'limiteCredito', step: '0.01', min: '0',
        value: cliente ? (cliente.limite_credito / 100).toFixed(2) : '0.00',
      })),
      campo('E-mail do vendedor responsável', h('input', { type: 'email', name: 'vendedorEmail', value: cliente?.vendedor_email || '' }))));
}

function abrirFormulario(cliente, aoSalvar) {
  const form = formularioCliente(cliente);
  modal({
    titulo: cliente ? `Editar ${cliente.nome}` : 'Novo cliente',
    corpo: form,
    acoes: [{
      rotulo: cliente ? 'Salvar' : 'Cadastrar',
      estilo: 'sucesso',
      aoClicar: async (fechar) => {
        try {
          const dados = lerFormulario(form);
          const payload = {
            tipo: dados.tipo,
            nome: dados.nome,
            documento: dados.documento,
            email: dados.email,
            telefone: dados.telefone,
            endereco: dados.endereco,
            limiteCredito: Math.round(Number(String(dados.limiteCredito || '0').replace(',', '.')) * 100),
            vendedorEmail: dados.vendedorEmail,
          };
          if (cliente) await api.put(`/api/clientes/${cliente.id}`, payload);
          else await api.post('/api/clientes', payload);
          fechar();
          toast(cliente ? 'Cliente atualizado.' : 'Cliente cadastrado.', 'ok');
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
    const lista = await api.get('/api/clientes');

    if (!lista.length) {
      limpar(areaTabela).append(vazio('Nenhum cliente cadastrado', 'Cadastre o primeiro cliente da carteira.'));
      return;
    }

    const corpo = h('tbody', {});
    for (const cliente of lista) {
      corpo.append(h('tr', { class: 'clicavel', onclick: () => abrirFormulario(cliente, recarregar) },
        h('td', {}, h('div', { class: 'forte' }, cliente.nome), etiqueta(cliente.tipo, '')),
        h('td', {}, cliente.documento || h('span', { class: 'silencioso' }, '—')),
        h('td', {}, cliente.email || h('span', { class: 'silencioso' }, '—')),
        h('td', {}, cliente.telefone || h('span', { class: 'silencioso' }, '—')),
        h('td', { class: 'num' }, moeda(cliente.limite_credito))));
    }

    limpar(areaTabela).append(h('div', { class: 'tabela-envolve' }, h('table', {},
      h('thead', {}, h('tr', {},
        h('th', {}, 'Cliente'), h('th', {}, 'Documento'), h('th', {}, 'E-mail'),
        h('th', {}, 'Telefone'), h('th', { class: 'num' }, 'Limite de crédito'))),
      corpo)));
  };

  ctx.definirCabecalho({
    titulo: 'Clientes',
    subtitulo: 'Gestão da carteira de clientes',
    acoes: [h('button', { class: 'botao', type: 'button', onclick: () => abrirFormulario(null, recarregar) },
      icone('mais'), 'Novo cliente')],
  });

  raiz.append(h('div', { class: 'cartao' },
    h('div', { class: 'cartao-cabeca' }, h('h3', {}, 'Clientes cadastrados')), areaTabela));

  await recarregar();
  return raiz;
}
