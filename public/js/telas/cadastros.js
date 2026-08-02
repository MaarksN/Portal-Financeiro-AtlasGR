import { api } from '../nucleo/api.js';
import {
  h, limpar, icone, toast, modal, dataHora, vazio, carregando
} from '../nucleo/ui.js';

function modalNovoCliente(aoTerminar) {
  const documento = h('input', { type: 'text', name: 'documento', required: true });
  const nome = h('input', { type: 'text', name: 'nome', required: true });
  const email = h('input', { type: 'email', name: 'email' });

  const corpo = h('div', { class: 'form-cliente' },
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
        aoClicar: async (fechar) => {
          if (!documento.value || !nome.value) return toast('Preencha os campos obrigatórios', 'erro');
          try {
            await api.post('/api/cadastros/clientes', {
                documento: documento.value,
                nome: nome.value,
                email: email.value || undefined
            });
            toast('Cliente cadastrado com sucesso', 'ok');
            fechar();
            aoTerminar();
          } catch (erro) {
            toast(erro.message, 'erro');
          }
        },
      }
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
