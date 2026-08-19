import { api } from '../nucleo/api.js';
import {
  h, limpar, icone, toast, modal, campo, lerFormulario, selecao,
  vazio, carregando, etiqueta, indicador, moeda, data,
} from '../nucleo/ui.js';

// ------------------------------------------------------------------
// Contas a pagar/receber, categorias e centros de custo. Três abas
// simples (sem router próprio - troca o conteúdo de uma área só).
// ------------------------------------------------------------------

const ABAS = [
  { id: 'geral', rotulo: 'Visão geral' },
  { id: 'lancamentos', rotulo: 'Lançamentos' },
  { id: 'cadastros', rotulo: 'Cadastros' },
];

function paraCentavos(valorTexto) {
  return Math.round(Number(String(valorTexto || '0').replace(',', '.')) * 100);
}

// -------------------------------- Geral --------------------------------
async function montarGeral() {
  const [contas, pendentes] = await Promise.all([
    api.get('/api/financeiro/contas'),
    api.get('/api/financeiro/lancamentos?status=pendente'),
  ]);

  const totalReceber = pendentes.filter((l) => l.tipo === 'receber').reduce((s, l) => s + l.valor_centavos, 0);
  const totalPagar = pendentes.filter((l) => l.tipo === 'pagar').reduce((s, l) => s + l.valor_centavos, 0);

  const listaContas = contas.length
    ? h('div', {}, ...contas.map((c) => h('div', {
      class: 'entre', style: 'padding:8px 0;border-bottom:1px solid var(--linha)',
    }, h('span', {}, c.nome), h('span', { class: 'silencioso', style: 'font-size:12px' }, c.instituicao || c.tipo))))
    : vazio('Nenhuma conta cadastrada', 'Cadastre em Cadastros > Contas.');

  return h('div', {},
    h('div', { class: 'indicadores' },
      indicador({ rotulo: 'A receber (pendente)', valor: moeda(totalReceber), tom: 'ok' }),
      indicador({ rotulo: 'A pagar (pendente)', valor: moeda(totalPagar), tom: 'critico' }),
      indicador({ rotulo: 'Contas cadastradas', valor: contas.length })),
    h('div', { class: 'cartao', style: 'margin-top:16px' },
      h('div', { class: 'cartao-cabeca' }, h('h3', {}, 'Contas bancárias / caixa')),
      h('div', { class: 'cartao-corpo' }, listaContas)));
}

// ----------------------------- Lançamentos -----------------------------
function formularioLancamento(contas, categorias, centros) {
  return h('form', {},
    campo('Tipo', selecao('tipo', [
      { valor: 'receber', rotulo: 'A receber' }, { valor: 'pagar', rotulo: 'A pagar' },
    ])),
    campo('Descrição', h('input', { type: 'text', name: 'descricao', required: true })),
    h('div', { class: 'linha-campos' },
      campo('Valor (R$)', h('input', { type: 'number', name: 'valor', step: '0.01', min: '0.01', required: true })),
      campo('Vencimento', h('input', { type: 'date', name: 'data_vencimento', required: true }))),
    h('div', { class: 'linha-campos' },
      campo('Conta', selecao('conta_id', [{ valor: '', rotulo: '—' }, ...contas.map((c) => ({ valor: c.id, rotulo: c.nome }))])),
      campo('Categoria', selecao('categoria_id', [{ valor: '', rotulo: '—' }, ...categorias.map((c) => ({ valor: c.id, rotulo: c.nome }))])),
      campo('Centro de custo', selecao('centro_custo_id', [{ valor: '', rotulo: '—' }, ...centros.map((c) => ({ valor: c.id, rotulo: c.nome }))]))),
    campo('Pessoa / fornecedor', h('input', { type: 'text', name: 'pessoa' })),
    campo('Observação', h('textarea', { name: 'observacao' })));
}

async function abrirNovoLancamento(aoSalvar) {
  const [contas, categorias, centros] = await Promise.all([
    api.get('/api/financeiro/contas'),
    api.get('/api/financeiro/categorias'),
    api.get('/api/financeiro/centros-custo'),
  ]);
  const form = formularioLancamento(contas, categorias, centros);
  modal({
    titulo: 'Novo lançamento',
    corpo: form,
    acoes: [{
      rotulo: 'Lançar',
      estilo: 'sucesso',
      aoClicar: async (fechar) => {
        try {
          const dados = lerFormulario(form);
          await api.post('/api/financeiro/lancamentos', {
            tipo: dados.tipo,
            descricao: dados.descricao,
            valor_centavos: paraCentavos(dados.valor),
            data_vencimento: dados.data_vencimento,
            conta_id: dados.conta_id ? Number(dados.conta_id) : null,
            categoria_id: dados.categoria_id ? Number(dados.categoria_id) : null,
            centro_custo_id: dados.centro_custo_id ? Number(dados.centro_custo_id) : null,
            pessoa: dados.pessoa,
            observacao: dados.observacao,
          });
          fechar();
          toast('Lançamento criado.', 'ok');
          aoSalvar();
        } catch (erro) {
          toast(erro.message, 'erro');
        }
      },
    }],
  });
}

async function montarLancamentos(recarregarAba) {
  const raiz = h('div', {});
  const areaTabela = h('div', { class: 'cartao-corpo sem-espaco' }, carregando());

  const carregar = async () => {
    const lancamentos = await api.get('/api/financeiro/lancamentos');
    if (!lancamentos.length) {
      limpar(areaTabela).append(vazio('Nenhum lançamento', 'Lance a primeira conta a pagar ou a receber.'));
      return;
    }

    const corpo = h('tbody', {});
    for (const l of lancamentos) {
      corpo.append(h('tr', {},
        h('td', {}, etiqueta(l.tipo === 'pagar' ? 'A pagar' : 'A receber', l.tipo === 'pagar' ? 'critico' : 'ok')),
        h('td', {}, l.descricao),
        h('td', { class: 'num' }, moeda(l.valor_centavos)),
        h('td', {}, data(l.data_vencimento)),
        h('td', {}, etiqueta(l.status, l.status === 'pago' ? 'ok' : l.status === 'cancelado' ? 'neutro' : 'alerta')),
        h('td', {}, l.status === 'pendente' ? h('button', {
          class: 'botao secundario pequeno', type: 'button',
          onclick: async () => {
            try {
              await api.post(`/api/financeiro/lancamentos/${l.id}/pagar`);
              toast('Lançamento baixado.', 'ok');
              carregar();
              recarregarAba?.();
            } catch (erro) {
              toast(erro.message, 'erro');
            }
          },
        }, 'Baixar') : null)));
    }

    limpar(areaTabela).append(h('div', { class: 'tabela-envolve' }, h('table', {},
      h('thead', {}, h('tr', {},
        h('th', {}, 'Tipo'), h('th', {}, 'Descrição'), h('th', { class: 'num' }, 'Valor'),
        h('th', {}, 'Vencimento'), h('th', {}, 'Status'), h('th', {}, ''))),
      corpo)));
  };

  raiz.append(h('div', { class: 'cartao' },
    h('div', { class: 'cartao-cabeca' },
      h('h3', {}, 'Lançamentos'),
      h('button', {
        class: 'botao secundario pequeno acoes', type: 'button',
        onclick: () => abrirNovoLancamento(carregar),
      }, icone('mais', 14), 'Novo lançamento')),
    areaTabela));

  await carregar();
  return raiz;
}

// ------------------------------ Cadastros ------------------------------
function blocoCadastro({ titulo, itens, aoNovo, linha }) {
  return h('div', { class: 'cartao' },
    h('div', { class: 'cartao-cabeca' },
      h('h3', {}, titulo),
      h('button', { class: 'botao secundario pequeno acoes', type: 'button', onclick: aoNovo }, icone('mais', 14))),
    h('div', { class: 'cartao-corpo' },
      itens.length
        ? h('div', {}, ...itens.map((item) => h('div', {
          class: 'entre', style: 'padding:7px 0;border-bottom:1px solid var(--linha);font-size:13px',
        }, linha(item))))
        : h('div', { class: 'silencioso', style: 'font-size:12.5px' }, 'Nenhum registro ainda.')));
}

async function montarCadastros(recarregarAba) {
  const [contas, categorias, centros] = await Promise.all([
    api.get('/api/financeiro/contas'),
    api.get('/api/financeiro/categorias'),
    api.get('/api/financeiro/centros-custo'),
  ]);

  const novaConta = () => {
    const form = h('form', {},
      campo('Nome', h('input', { type: 'text', name: 'nome', required: true })),
      campo('Tipo', selecao('tipo', ['corrente', 'poupanca', 'carteira', 'caixa', 'aplicacao'])),
      campo('Instituição', h('input', { type: 'text', name: 'instituicao' })));
    modal({
      titulo: 'Nova conta', corpo: form,
      acoes: [{
        rotulo: 'Cadastrar', estilo: 'sucesso',
        aoClicar: async (fechar) => {
          try {
            const dados = lerFormulario(form);
            await api.post('/api/financeiro/contas', { ...dados, saldo_inicial_centavos: 0 });
            fechar();
            toast('Conta cadastrada.', 'ok');
            recarregarAba();
          } catch (erro) {
            toast(erro.message, 'erro');
          }
        },
      }],
    });
  };

  const novaCategoria = () => {
    const form = h('form', {},
      campo('Nome', h('input', { type: 'text', name: 'nome', required: true })),
      campo('Tipo', selecao('tipo', [{ valor: 'receita', rotulo: 'Receita' }, { valor: 'despesa', rotulo: 'Despesa' }])));
    modal({
      titulo: 'Nova categoria', corpo: form,
      acoes: [{
        rotulo: 'Cadastrar', estilo: 'sucesso',
        aoClicar: async (fechar) => {
          try {
            await api.post('/api/financeiro/categorias', lerFormulario(form));
            fechar();
            toast('Categoria cadastrada.', 'ok');
            recarregarAba();
          } catch (erro) {
            toast(erro.message, 'erro');
          }
        },
      }],
    });
  };

  const novoCentro = () => {
    const form = h('form', {},
      campo('Nome', h('input', { type: 'text', name: 'nome', required: true })),
      campo('Código', h('input', { type: 'text', name: 'codigo' })));
    modal({
      titulo: 'Novo centro de custo', corpo: form,
      acoes: [{
        rotulo: 'Cadastrar', estilo: 'sucesso',
        aoClicar: async (fechar) => {
          try {
            await api.post('/api/financeiro/centros-custo', lerFormulario(form));
            fechar();
            toast('Centro de custo cadastrado.', 'ok');
            recarregarAba();
          } catch (erro) {
            toast(erro.message, 'erro');
          }
        },
      }],
    });
  };

  return h('div', { class: 'grade duas' },
    blocoCadastro({
      titulo: 'Contas', itens: contas, aoNovo: novaConta,
      linha: (c) => [h('b', {}, c.nome), h('span', { class: 'direita silencioso' }, c.tipo)],
    }),
    blocoCadastro({
      titulo: 'Categorias', itens: categorias, aoNovo: novaCategoria,
      linha: (c) => [etiqueta(c.tipo, c.tipo === 'despesa' ? 'critico' : 'ok'), ' ', h('b', {}, c.nome)],
    }),
    blocoCadastro({
      titulo: 'Centros de custo', itens: centros, aoNovo: novoCentro,
      linha: (c) => [h('b', {}, c.nome), c.codigo ? h('span', { class: 'direita silencioso' }, c.codigo) : null],
    }));
}

// --------------------------------- Casca --------------------------------
export async function montar(ctx) {
  ctx.definirCabecalho({ titulo: 'Financeiro', subtitulo: 'Contas a pagar, a receber e fluxo de caixa' });

  const area = h('div', {}, carregando());
  let abaAtual = 'geral';

  const renderizarBotoes = () => h('div', { class: 'row', style: 'margin-bottom:16px' },
    ...ABAS.map((aba) => h('button', {
      class: `botao ${aba.id === abaAtual ? '' : 'secundario'} pequeno`,
      type: 'button',
      onclick: () => irPara(aba.id),
    }, aba.rotulo)));

  const raiz = h('div', {}, renderizarBotoes(), area);

  async function renderizarConteudo() {
    limpar(area).append(carregando());
    try {
      const conteudo = abaAtual === 'geral' ? await montarGeral()
        : abaAtual === 'lancamentos' ? await montarLancamentos(renderizarConteudo)
          : await montarCadastros(renderizarConteudo);
      limpar(area).append(conteudo);
    } catch (erro) {
      limpar(area).append(h('div', { class: 'aviso critico' }, icone('alerta', 16), h('div', {}, erro.message)));
    }
  }

  function irPara(aba) {
    abaAtual = aba;
    limpar(raiz).append(renderizarBotoes(), area);
    renderizarConteudo();
  }

  await renderizarConteudo();
  return raiz;
}
