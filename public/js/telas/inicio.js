import { api, sessao } from '../nucleo/api.js';
import {
  h, limpar, icone, moeda, moedaCurta,
  carregando, etiqueta, indicador,
} from '../nucleo/ui.js';

// A central propriamente dita: uma tela que responde "o que precisa de
// mim agora?" juntando reembolso, aprovações e — para quem é do
// financeiro — a carteira de cobranças.

function bomDia() {
  const hora = new Date().getHours();
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

function bloco({ titulo, acao, aoClicar, conteudo }) {
  return h('div', { class: 'cartao' },
    h('div', { class: 'cartao-cabeca' },
      h('h3', {}, titulo),
      acao ? h('button', { class: 'botao fantasma pequeno acoes', type: 'button', onclick: aoClicar }, acao) : null),
    h('div', { class: 'cartao-corpo' }, conteudo));
}

const linha = (esquerda, direita, aoClicar) => h('div', {
  class: 'entre',
  style: `padding:8px 0;border-bottom:1px solid var(--linha);${aoClicar ? 'cursor:pointer' : ''}`,
  onclick: aoClicar,
}, esquerda, h('span', { class: 'direita' }, direita));

export async function montar(ctx) {
  const raiz = h('div', {}, carregando());
  const permissoes = sessao().permissoes || {};
  const usuario = sessao().usuario;

  // Cada bloco é opcional conforme o papel — buscamos em paralelo e
  // toleramos falha individual para um módulo fora do ar não derrubar
  // a tela inteira.
  const seguro = (promessa, padrao) => promessa.catch(() => padrao);

  const [resumoReembolso, relatorios, fila, painel] = await Promise.all([
    seguro(api.get('/api/reembolsos/resumo'), { rascunhos: 0, emAprovacao: 0, aprovados: 0, pagos: 0, aReceberCentavos: 0, emAprovacaoCentavos: 0 }),
    seguro(api.get('/api/reembolsos'), []),
    permissoes.aprovaReembolso ? seguro(api.get('/api/reembolsos/fila'), []) : Promise.resolve(null),
    permissoes.financeiro ? seguro(api.get('/api/cobrancas/painel'), null) : Promise.resolve(null),
  ]);

  ctx.definirDistintivo('reembolsos', resumoReembolso.rascunhos + resumoReembolso.emAprovacao);
  if (fila) ctx.definirDistintivo('aprovacoes', fila.length, fila.length > 0);
  if (painel) {
    const abertas = painel.funil.filter((c) => !['paga', 'perda'].includes(c.id)).reduce((s, c) => s + c.quantidade, 0);
    ctx.definirDistintivo('cobrancas', abertas, painel.indicadores.promessasQuebradas > 0);
  }

  ctx.definirCabecalho({
    titulo: `${bomDia()}, ${usuario.nome.split(' ')[0]}`,
    subtitulo: new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  });

  // -------------------------- o que precisa de você --------------------------
  const pendencias = [];
  if (fila?.length) {
    pendencias.push({
      texto: `${fila.length} relatório(s) de reembolso aguardando a sua aprovação`,
      valor: moeda(fila.reduce((s, r) => s + r.totalCentavos, 0)),
      tom: 'alerta',
      ir: 'aprovacoes',
    });
  }
  if (resumoReembolso.rascunhos) {
    pendencias.push({ texto: `${resumoReembolso.rascunhos} relatório(s) em rascunho, ainda não enviados`, tom: 'neutro', ir: 'reembolsos' });
  }
  if (painel?.agenda.length) {
    pendencias.push({
      texto: `${painel.agenda.length} cobrança(s) com ação marcada para hoje ou atrasada`,
      valor: moeda(painel.agenda.reduce((s, c) => s + c.saldoCentavos, 0)),
      tom: 'alerta',
      ir: 'cobrancas',
    });
  }
  if (painel?.indicadores.promessasQuebradas) {
    pendencias.push({
      texto: `${painel.indicadores.promessasQuebradas} promessa(s) de pagamento quebrada(s)`,
      tom: 'critico',
      ir: 'cobrancas',
    });
  }

  const cartaoPendencias = bloco({
    titulo: 'O que precisa de você',
    conteudo: pendencias.length
      ? h('div', { class: 'pilha', style: 'gap:0' }, ...pendencias.map((p) => linha(
        h('span', { class: 'entre', style: 'gap:8px' }, etiqueta('•', p.tom), h('span', { style: 'font-size:13px' }, p.texto)),
        h('span', { class: 'entre', style: 'gap:8px' },
          p.valor ? h('b', { class: 'mono', style: 'font-size:13px' }, p.valor) : null,
          icone('externo', 13)),
        () => ctx.irPara(p.ir),
      )))
      : h('div', { class: 'aviso ok' }, icone('relogio', 16),
        h('div', {}, h('b', {}, 'Nada pendente. '), 'Sua fila está limpa.')),
  });

  // -------------------------- indicadores do topo --------------------------
  const topo = h('div', { class: 'indicadores' },
    indicador({
      rotulo: 'Reembolso em aprovação', valor: moeda(resumoReembolso.emAprovacaoCentavos),
      nota: `${resumoReembolso.emAprovacao} relatório(s)`,
    }),
    fila ? indicador({
      rotulo: 'Aguardando sua alçada', valor: fila.length, tom: fila.length ? 'alerta' : 'ok',
      nota: fila.length ? moeda(fila.reduce((s, r) => s + r.totalCentavos, 0)) : 'fila limpa',
    }) : null,
    painel ? indicador({
      rotulo: 'Carteira em aberto', valor: moedaCurta(painel.indicadores.abertoCentavos),
      nota: `${painel.indicadores.percentualVencido}% vencido`,
    }) : null,
    painel ? indicador({
      rotulo: 'Vencido', valor: moedaCurta(painel.indicadores.vencidoCentavos), tom: 'critico',
      nota: `DSO ${painel.indicadores.dso ?? '—'} dias`,
    }) : null,
  );

  // -------------------------- blocos por módulo --------------------------
  const meusRelatorios = relatorios.filter((r) => ['rascunho', 'em_aprovacao', 'devolvido'].includes(r.estado));
  const cartaoReembolso = bloco({
    titulo: 'Meus relatórios em curso',
    acao: 'Ver todos',
    aoClicar: () => ctx.irPara('reembolsos'),
    conteudo: meusRelatorios.length
      ? h('div', {}, ...meusRelatorios.slice(0, 5).map((relatorio) => linha(
        h('div', {},
          h('div', { style: 'font-size:13px;font-weight:600' }, relatorio.titulo),
          h('div', { class: 'silencioso', style: 'font-size:11px' },
            `${relatorio.estadoRotulo}${relatorio.nivelAtual ? ` · aguarda ${relatorio.nivelAtual}` : ''}`)),
        h('b', { class: 'mono', style: 'font-size:13px' }, moeda(relatorio.totalCentavos)),
        () => ctx.irPara(`reembolsos/${relatorio.id}`),
      )))
      : h('div', { class: 'silencioso', style: 'font-size:12.5px' }, 'Nenhum relatório em curso.'),
  });

  const cartaoCobrancas = painel ? bloco({
    titulo: 'Funil de cobrança',
    acao: 'Abrir funil',
    aoClicar: () => ctx.irPara('cobrancas'),
    conteudo: h('div', {}, ...painel.funil
      .filter((coluna) => coluna.quantidade > 0)
      .map((coluna) => linha(
        h('span', { class: 'entre', style: 'gap:8px' },
          h('span', { class: `tom-${coluna.tom}`, style: 'width:8px;height:8px;border-radius:50%;background:var(--tom);display:inline-block' }),
          h('span', { style: 'font-size:13px' }, coluna.rotulo),
          h('span', { class: 'silencioso', style: 'font-size:11.5px' }, `(${coluna.quantidade})`)),
        h('b', { class: 'mono', style: 'font-size:13px' }, moedaCurta(coluna.saldoCentavos)),
        () => ctx.irPara('cobrancas'),
      ))),
  }) : null;

  limpar(raiz).append(
    topo,
    cartaoPendencias,
    h('div', { class: 'grade duas', style: 'margin-top:16px' },
      cartaoReembolso,
      cartaoCobrancas),
  );

  return raiz;
}
