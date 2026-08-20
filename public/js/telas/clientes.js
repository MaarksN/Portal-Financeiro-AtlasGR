import { api } from '../nucleo/api.js';
import {
  h, limpar, icone, toast, modal, campo, lerFormulario, selecao,
  vazio, carregando, moeda, etiqueta,
} from '../nucleo/ui.js';

// ------------------------------------------------------------------
// Carteira de clientes. Mesma estrutura de telas/produtos.js.
// ------------------------------------------------------------------

async function abrirBuscaBitrix(preencherForm) {
  try {
    toast('Consultando Bitrix24...', 'info');
    const res = await api.get('/api/bitrix/buscar-clientes');
    const lista = res.clientes || [];

    const conteudos = h('div', { style: 'max-height: 350px; overflow-y: auto;' });
    for (const cli of lista) {
      conteudos.append(h('div', {
        class: 'cartao',
        style: 'margin-bottom: 8px; padding: 10px; cursor: pointer; border: 1px solid var(--borda, #e5e7eb);',
        onclick: () => {
          preencherForm(cli);
          fecharModalBitrix();
          toast(`Dados sincronizados via Bitrix24: ${cli.nome}`, 'ok');
        },
      },
        h('div', { class: 'forte' }, cli.nome),
        h('div', { class: 'subtitulo', style: 'font-size: 12px;' }, `Doc: ${cli.documento || 'N/A'} | E-mail: ${cli.email || 'N/A'} | Tel: ${cli.telefone || 'N/A'}`)));
    }

    let fecharModalBitrix = () => {};
    fecharModalBitrix = modal({
      titulo: '🔍 Buscar / Sincronizar Cliente no Bitrix24',
      corpo: h('div', {},
        h('p', { class: 'texto-suave', style: 'margin-bottom: 12px;' }, 'Selecione uma empresa/negócio importado do Bitrix24 para preencher automaticamente os campos cadastrais:'),
        conteudos),
      acoes: [{ rotulo: 'Fechar', aoClicar: (fechar) => fechar() }],
    });
  } catch (erro) {
    toast(`Falha ao buscar no Bitrix24: ${erro.message}`, 'erro');
  }
}

function popupConfirmacao(titulo, mensagem) {
  modal({
    titulo,
    corpo: h('div', { style: 'text-align: center; padding: 16px;' },
      h('div', { style: 'font-size: 40px; margin-bottom: 12px;' }, '✅'),
      h('h3', { style: 'margin-bottom: 8px;' }, titulo),
      h('p', { class: 'texto-suave' }, mensagem)),
    acoes: [{ rotulo: 'OK', estilo: 'sucesso', aoClicar: (fechar) => fechar() }],
  });
}

function formularioCliente(cliente, formRef) {
  const inputNome = h('input', { type: 'text', name: 'nome', required: true, value: cliente?.nome || '' });
  const inputDoc = h('input', { type: 'text', name: 'documento', value: cliente?.documento || '' });
  const inputEmail = h('input', { type: 'email', name: 'email', value: cliente?.email || '' });
  const inputTel = h('input', { type: 'text', name: 'telefone', value: cliente?.telefone || '' });

  const btnSyncBitrix = h('button', {
    type: 'button',
    class: 'botao secundario pequeno',
    style: 'margin-bottom: 12px; width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;',
    onclick: () => abrirBuscaBitrix((cli) => {
      if (cli.nome) inputNome.value = cli.nome;
      if (cli.documento) inputDoc.value = cli.documento;
      if (cli.email) inputEmail.value = cli.email;
      if (cli.telefone) inputTel.value = cli.telefone;
    }),
  }, icone('fonte', 14), ' 🔍 Buscar / Sincronizar com Bitrix24');

  return h('form', {},
    btnSyncBitrix,
    campo('Tipo', selecao('tipo', [
      { valor: 'PF', rotulo: 'Pessoa física' },
      { valor: 'PJ', rotulo: 'Pessoa jurídica' },
    ], cliente?.tipo || 'PJ')),
    campo('Nome / razão social', inputNome),
    campo('Documento (CPF/CNPJ)', inputDoc),
    h('div', { class: 'linha-campos' },
      campo('E-mail', inputEmail),
      campo('Telefone', inputTel)),
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
          popupConfirmacao(
            cliente ? 'Cliente Atualizado!' : 'Cliente Cadastrado com Sucesso!',
            `Os dados do cliente "${dados.nome}" foram armazenados na carteira.`
          );
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
