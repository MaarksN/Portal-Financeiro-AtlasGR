import { api } from '../nucleo/api.js';
import { h, limpar, carregando, icone, moeda, moedaCurta } from '../nucleo/ui.js';

function aba({ id, rotulo, ativa, aoClicar }) {
  return h('button', {
    type: 'button',
    class: `aba ${ativa ? 'on' : ''}`,
    onclick: () => aoClicar(id),
  }, rotulo);
}

function secaoConstrucao(relatorio) {
  return h('div', { class: 'aviso neutro' }, icone('info', 16),
    h('div', {}, h('b', {}, 'Em construção: '), `O relatório de ${relatorio} está sendo implementado. Os dados exibidos abaixo são apenas exemplos e não representam informações reais do sistema.`));
}

function renderizarDRE(dados) {
  if (!dados || !dados.dre) return h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' }, secaoConstrucao('DRE')));

  const linhas = dados.dre.map(l => h('tr', {},
    h('td', {}, l.descricao),
    h('td', { class: 'mono direita' }, moeda(l.valorCentavos))
  ));

  return h('div', { class: 'cartao' },
    h('div', { class: 'cartao-cabeca' }, h('h3', {}, 'Demonstração do Resultado do Exercício')),
    h('div', { class: 'cartao-corpo' },
      h('table', { class: 'tabela' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Descrição'), h('th', { class: 'direita' }, 'Valor'))),
        h('tbody', {}, ...linhas)
      )
    )
  );
}

function renderizarFluxo(dados) {
  if (!dados || !dados.fluxo) return h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' }, secaoConstrucao('Fluxo de Caixa')));
  return h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' }, secaoConstrucao('Fluxo de Caixa'))); // Placeholder real impl
}

export async function montar(ctx) {
  const raiz = h('div', {}, carregando());

  let abaAtiva = ctx.parametro || 'dre';
  let dadosCache = {};

  async function desenhar() {
    limpar(raiz);

    const abas = h('div', { class: 'abas' },
      aba({ id: 'dre', rotulo: 'DRE', ativa: abaAtiva === 'dre', aoClicar: irAba }),
      aba({ id: 'fluxo', rotulo: 'Fluxo de Caixa', ativa: abaAtiva === 'fluxo', aoClicar: irAba }),
      aba({ id: 'financeiros', rotulo: 'Financeiros', ativa: abaAtiva === 'financeiros', aoClicar: irAba }),
      aba({ id: 'vendas', rotulo: 'Vendas', ativa: abaAtiva === 'vendas', aoClicar: irAba }),
      aba({ id: 'compras', rotulo: 'Compras', ativa: abaAtiva === 'compras', aoClicar: irAba }),
      aba({ id: 'estoque', rotulo: 'Estoque', ativa: abaAtiva === 'estoque', aoClicar: irAba }),
      aba({ id: 'construtor', rotulo: 'Construtor', ativa: abaAtiva === 'construtor', aoClicar: irAba })
    );

    const painel = h('div', { style: 'margin-top: 16px' }, carregando());
    raiz.append(abas, painel);

    try {
      if (!dadosCache[abaAtiva]) {
        dadosCache[abaAtiva] = await api.get(`/api/relatorios/${abaAtiva}`);
      }

      const dados = dadosCache[abaAtiva];
      limpar(painel);

      if (abaAtiva === 'dre') painel.append(renderizarDRE(dados));
      else if (abaAtiva === 'fluxo') painel.append(renderizarFluxo(dados));
      else painel.append(h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' }, secaoConstrucao(abaAtiva))));

    } catch (e) {
      limpar(painel).append(
        h('div', { class: 'aviso critico' }, icone('alerta', 16),
          h('div', {}, 'Não foi possível carregar os dados do relatório: ', e.message))
      );
    }
  }

  function irAba(id) {
    abaAtiva = id;
    ctx.irPara(`relatorios/${id}`);
    desenhar();
  }

  ctx.definirCabecalho({ titulo: 'Central de Relatórios', subtitulo: 'Visualização e construção de relatórios consolidados' });
  await desenhar();

  return raiz;
}
