import { api } from '../nucleo/api.js';
import {
  h, limpar, icone, toast, modal, dataHora, vazio, carregando
} from '../nucleo/ui.js';

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
          toast(`Dados preenchidos via Bitrix24: ${cli.nome}`, 'ok');
        },
      },
        h('div', { class: 'forte' }, cli.nome),
        h('div', { class: 'subtitulo', style: 'font-size: 12px;' }, `Doc: ${cli.documento || 'N/A'} | E-mail: ${cli.email || 'N/A'}`)));
    }

    let fecharModalBitrix = () => {};
    fecharModalBitrix = modal({
      titulo: '🔍 Buscar Cliente no Bitrix24',
      corpo: h('div', {},
        h('p', { class: 'texto-suave', style: 'margin-bottom: 12px;' }, 'Selecione uma empresa/contato importado do Bitrix24 para preencher automaticamente:'),
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
    acoes: [{ rotulo: 'Entendido', estilo: 'sucesso', aoClicar: (fechar) => fechar() }],
  });
}

function modalNovoCliente(aoTerminar) {
  const documento = h('input', { type: 'text', name: 'documento', required: true, placeholder: 'CNPJ ou CPF' });
  const nome = h('input', { type: 'text', name: 'nome', required: true, placeholder: 'Razão Social / Nome' });
  const email = h('input', { type: 'email', name: 'email', placeholder: 'email@cliente.com' });

  const btnSyncBitrix = h('button', {
    type: 'button',
    class: 'botao secundario pequeno',
    style: 'margin-bottom: 12px; width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;',
    onclick: () => abrirBuscaBitrix((cli) => {
      if (cli.documento) documento.value = cli.documento;
      if (cli.nome) nome.value = cli.nome;
      if (cli.email) email.value = cli.email;
    }),
  }, icone('fonte', 14), ' 🔍 Buscar / Sincronizar dados com Bitrix24');

  const corpo = h('div', { class: 'form-cliente' },
    btnSyncBitrix,
    h('label', { class: 'campo' }, h('span', {}, 'Documento'), documento),
    h('label', { class: 'campo' }, h('span', {}, 'Nome'), nome),
    h('label', { class: 'campo' }, h('span', {}, 'E-mail'), email)
  );

  modal({
    titulo: 'Novo Cliente',
    corpo,
    acoes: [
      { rotulo: 'Cancelar', aoClicar: (fechar) => fechar() },
      {
        rotulo: 'Salvar',
        estilo: 'sucesso',
        aoClicar: async (fechar) => {
          if (!documento.value || !nome.value) return toast('Preencha os campos obrigatórios', 'erro');
          try {
            await api.post('/api/cadastros/clientes', {
              documento: documento.value,
              nome: nome.value,
              email: email.value || undefined,
            });
            fechar();
            popupConfirmacao('Cliente Cadastrado com Sucesso!', `O cliente "${nome.value}" foi salvo com sucesso no banco de dados do portal.`);
            aoTerminar();
          } catch (erro) {
            toast(erro.message, 'erro');
          }
        },
      },
    ],
  });
}

export async function montar(ctx) {
  const raiz = h('div', {});
  const area = h('div', {}, carregando());

  const recarregar = async () => {
    limpar(area).append(carregando());
    try {
      const clientes = await api.get('/api/cadastros/clientes');

      const linhas = h('tbody', {});
      for (const c of clientes) {
        linhas.append(h('tr', {},
          h('td', {}, h('b', {}, c.documento)),
          h('td', {}, c.nome),
          h('td', {}, c.email || '—'),
          h('td', { class: 'silencioso' }, dataHora(c.criado_em))
        ));
      }

      limpar(area).append(
        h('div', { class: 'cartao' },
          h('div', { class: 'cartao-corpo sem-espaco' },
            clientes.length ? h('div', { class: 'tabela-envolve' }, h('table', {},
              h('thead', {}, h('tr', {},
                h('th', {}, 'Documento'), h('th', {}, 'Nome'), h('th', {}, 'E-mail'), h('th', {}, 'Criado em')
              )),
              linhas
            )) : vazio('Nenhum cliente cadastrado.')
          )
        )
      );
    } catch (erro) {
      limpar(area).append(h('div', { class: 'aviso critico' }, erro.message));
    }
  };

  ctx.definirCabecalho({
    titulo: 'Cadastros Centrais (Clientes)',
    acoes: [
      h('button', { class: 'botao secundario', type: 'button', onclick: recarregar }, icone('atualizar'), 'Atualizar'),
      h('button', { class: 'botao', type: 'button', onclick: () => modalNovoCliente(recarregar) }, 'Novo Cliente')
    ],
  });

  raiz.append(area);
  await recarregar();
  return raiz;
}
