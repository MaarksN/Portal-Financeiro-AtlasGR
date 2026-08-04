import { h, limpar, icone, toast, formatarMoeda, carregando } from '../nucleo/ui.js';
import { requisitar } from '../nucleo/api.js';

let cx;
let tabAtual = 'geral';

export async function montar(contexto) {
  cx = contexto;
  cx.definirCabecalho({
    titulo: 'Financeiro',
    subtitulo: 'Contas a pagar, a receber e fluxo de caixa',
  });

  const abas = h('div', { class: 'abas' },
    h('button', { class: `aba ${tabAtual === 'geral' ? 'ativa' : ''}`, onclick: (e) => trocarAba('geral', e.target) }, 'Visão Geral'),
    h('button', { class: `aba ${tabAtual === 'lancamentos' ? 'ativa' : ''}`, onclick: (e) => trocarAba('lancamentos', e.target) }, 'Lançamentos'),
    h('button', { class: `aba ${tabAtual === 'cadastros' ? 'ativa' : ''}`, onclick: (e) => trocarAba('cadastros', e.target) }, 'Cadastros')
  );

  const container = h('div', { id: 'financeiro-conteudo' });
  const raiz = h('div', {}, abas, container);

  // Render initial tab content after short delay so container exists
  setTimeout(() => renderizarAbaAtual(container), 0);

  return raiz;
}

function trocarAba(novaAba, target) {
  tabAtual = novaAba;
  const container = document.getElementById('financeiro-conteudo');
  if (container) {
    document.querySelectorAll('.aba').forEach(el => el.classList.remove('ativa'));
    if (target) target.classList.add('ativa');
    renderizarAbaAtual(container);
  }
}

async function renderizarAbaAtual(container) {
  limpar(container).append(carregando());
  try {
    if (tabAtual === 'geral') {
      const conteudo = await renderizarGeral();
      limpar(container).append(conteudo);
    } else if (tabAtual === 'lancamentos') {
      const conteudo = await renderizarLancamentos();
      limpar(container).append(conteudo);
    } else if (tabAtual === 'cadastros') {
      const conteudo = await renderizarCadastros();
      limpar(container).append(conteudo);
    }
  } catch (erro) {
    limpar(container).append(
      h('div', { class: 'aviso critico' }, 'Erro ao carregar dados do financeiro: ', erro.message)
    );
  }
}

async function renderizarGeral() {
  const contas = await requisitar('/api/financeiro/contas');
  const lancamentos = await requisitar('/api/financeiro/lancamentos?status=pendente');

  let totalReceber = 0;
  let totalPagar = 0;

  lancamentos.forEach(l => {
    if (l.tipo === 'receber') totalReceber += l.valor_centavos;
    if (l.tipo === 'pagar') totalPagar += l.valor_centavos;
  });

  return h('div', { class: 'grade' },
    h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' },
      h('h3', {}, 'A Receber (Pendente)'),
      h('div', { class: 'valor-destaque positivo' }, formatarMoeda(totalReceber))
    )),
    h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' },
      h('h3', {}, 'A Pagar (Pendente)'),
      h('div', { class: 'valor-destaque negativo' }, formatarMoeda(totalPagar))
    )),
    h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' },
      h('h3', {}, 'Contas Bancárias / Caixa'),
      h('ul', { class: 'lista-simples' },
        contas.map(c => h('li', {},
          h('b', {}, c.nome),
          h('span', { class: 'detalhe' }, c.instituicao ? ` - ${c.instituicao}` : '')
        ))
      ),
      contas.length === 0 ? h('div', { class: 'vazio' }, 'Nenhuma conta cadastrada') : null
    ))
  );
}

async function renderizarLancamentos() {
  const lancamentos = await requisitar('/api/financeiro/lancamentos');

  const trs = lancamentos.map(l => h('tr', {},
    h('td', {}, h('span', { class: `tag ${l.tipo === 'pagar' ? 'negativo' : 'positivo'}` }, l.tipo.toUpperCase())),
    h('td', {}, l.descricao),
    h('td', {}, formatarMoeda(l.valor_centavos)),
    h('td', {}, new Date(l.data_vencimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' })),
    h('td', {}, h('span', { class: `tag ${l.status === 'pago' ? 'sucesso' : 'neutro'}` }, l.status)),
    h('td', { class: 'acoes' },
      l.status === 'pendente'
        ? h('button', { class: 'botao secundario pequeno', onclick: () => pagarLancamento(l.id) }, icone('check', 14), ' Baixar')
        : null
    )
  ));

  return h('div', { class: 'cartao' },
    h('div', { class: 'cartao-cabecalho' },
      h('h2', {}, 'Lançamentos'),
      h('button', { class: 'botao primario', onclick: abrirModalLancamento }, '+ Novo Lançamento')
    ),
    h('div', { class: 'tabela-responsiva' },
      h('table', {},
        h('thead', {}, h('tr', {},
          h('th', {}, 'Tipo'), h('th', {}, 'Descrição'), h('th', {}, 'Valor'), h('th', {}, 'Vencimento'), h('th', {}, 'Status'), h('th', {}, 'Ações')
        )),
        h('tbody', {}, trs.length ? trs : h('tr', {}, h('td', { colspan: 6, class: 'vazio' }, 'Nenhum lançamento encontrado')))
      )
    )
  );
}

async function pagarLancamento(id) {
  if (!confirm('Confirmar baixa deste lançamento?')) return;
  try {
    await requisitar(`/api/financeiro/lancamentos/${id}/pagar`, { method: 'POST' });
    toast('Lançamento baixado com sucesso', 'sucesso');
    cx.recarregar();
  } catch (erro) {
    toast(`Erro: ${erro.message}`, 'erro');
  }
}

function abrirModalLancamento() {
  alert('Modal de novo lançamento a ser implementado');
}

async function renderizarCadastros() {
  const [contas, categorias, centros] = await Promise.all([
    requisitar('/api/financeiro/contas'),
    requisitar('/api/financeiro/categorias'),
    requisitar('/api/financeiro/centros-custo')
  ]);

  return h('div', { class: 'grade' },
    // Contas
    h('div', { class: 'cartao' },
      h('div', { class: 'cartao-cabecalho' }, h('h3', {}, 'Contas'), h('button', { class: 'botao secundario pequeno', onclick: novaConta }, '+ Conta')),
      h('div', { class: 'cartao-corpo' },
        h('ul', { class: 'lista-simples' },
          contas.map(c => h('li', {}, h('b', {}, c.nome), h('span', { class: 'detalhe' }, c.tipo)))
        ),
        contas.length === 0 ? h('div', { class: 'vazio' }, 'Nenhuma conta') : null
      )
    ),
    // Categorias
    h('div', { class: 'cartao' },
      h('div', { class: 'cartao-cabecalho' }, h('h3', {}, 'Categorias'), h('button', { class: 'botao secundario pequeno', onclick: novaCategoria }, '+ Categoria')),
      h('div', { class: 'cartao-corpo' },
        h('ul', { class: 'lista-simples' },
          categorias.map(c => h('li', {}, h('span', { class: `tag ${c.tipo === 'despesa' ? 'negativo' : 'positivo'}` }, c.tipo.toUpperCase()), ' ', h('b', {}, c.nome)))
        ),
        categorias.length === 0 ? h('div', { class: 'vazio' }, 'Nenhuma categoria') : null
      )
    ),
    // Centros de Custo
    h('div', { class: 'cartao' },
      h('div', { class: 'cartao-cabecalho' }, h('h3', {}, 'Centros de Custo'), h('button', { class: 'botao secundario pequeno', onclick: novoCentroCusto }, '+ Centro')),
      h('div', { class: 'cartao-corpo' },
        h('ul', { class: 'lista-simples' },
          centros.map(c => h('li', {}, h('b', {}, c.nome), h('span', { class: 'detalhe' }, c.codigo ? ` (${c.codigo})` : '')))
        ),
        centros.length === 0 ? h('div', { class: 'vazio' }, 'Nenhum centro de custo') : null
      )
    )
  );
}

function novaConta() { alert('Modal de nova conta a ser implementado'); }
function novaCategoria() { alert('Modal de nova categoria a ser implementado'); }
function novoCentroCusto() { alert('Modal de novo centro de custo a ser implementado'); }
