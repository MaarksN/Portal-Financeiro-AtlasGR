import { api } from '../nucleo/api.js';
import {
  h, limpar, icone, toast, modal, dataHora, vazio, carregando, etiqueta
} from '../nucleo/ui.js';

function modalNovaEmpresa(aoTerminar) {
  const cnpj = h('input', { type: 'text', name: 'cnpj', required: true });
  const razao_social = h('input', { type: 'text', name: 'razao_social', required: true });

  const corpo = h('div', { class: 'form-empresa' },
    h('label', { class: 'campo' }, h('span', {}, 'CNPJ (somente números)'), cnpj),
    h('label', { class: 'campo' }, h('span', {}, 'Razão Social'), razao_social)
  );

  modal({
    titulo: 'Nova Empresa',
    corpo,
    acoes: [
      { rotulo: 'Cancelar', aoClicar: (fechar) => fechar() },
      {
        rotulo: 'Salvar',
        aoClicar: async (fechar) => {
          if (!cnpj.value || !razao_social.value) return toast('Preencha os campos obrigatórios', 'erro');
          try {
            await api.post('/api/empresas', { cnpj: cnpj.value, razao_social: razao_social.value });
            toast('Empresa cadastrada com sucesso', 'ok');
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
      const empresas = await api.get('/api/empresas');

      const linhas = h('tbody', {});
      for (const empresa of empresas) {
        linhas.append(h('tr', {},
          h('td', {}, h('b', {}, empresa.cnpj)),
          h('td', {}, empresa.razao_social),
          h('td', {}, empresa.ativo ? etiqueta('Ativo', 'ok') : etiqueta('Inativo', 'neutro')),
          h('td', { class: 'silencioso' }, dataHora(empresa.criado_em))
        ));
      }

      limpar(area).append(
        h('div', { class: 'cartao' },
          h('div', { class: 'cartao-corpo sem-espaco' },
            empresas.length ? h('div', { class: 'tabela-envolve' }, h('table', {},
              h('thead', {}, h('tr', {},
                h('th', {}, 'CNPJ'), h('th', {}, 'Razão Social'), h('th', {}, 'Status'), h('th', {}, 'Criado em')
              )),
              linhas
            )) : vazio('Nenhuma empresa cadastrada.')
          )
        )
      );
    } catch (erro) {
      limpar(area).append(h('div', { class: 'aviso critico' }, erro.message));
    }
  };

  ctx.definirCabecalho({
    titulo: 'Empresas e Filiais',
    acoes: [
      h('button', { class: 'botao secundario', type: 'button', onclick: recarregar }, icone('atualizar'), 'Atualizar'),
      h('button', { class: 'botao', type: 'button', onclick: () => modalNovaEmpresa(recarregar) }, 'Nova Empresa')
    ],
  });

  raiz.append(area);
  await recarregar();
  return raiz;
}
