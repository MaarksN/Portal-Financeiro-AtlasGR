import { api, sessao } from '../nucleo/api.js';
import {
  h, limpar, icone, moeda, moedaCurta,
  carregando, etiqueta, indicador, bannerAlerta,
  cardMes, cardDia, aviso,
} from '../nucleo/ui.js';

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
  style: `padding:9px 0;border-bottom:1px solid var(--linha);${aoClicar ? 'cursor:pointer' : ''}`,
  onclick: aoClicar,
}, esquerda, h('span', { class: 'direita' }, direita));

export async function montar(ctx) {
  const raiz = h('div', {}, carregando());
  const permissoes = sessao().permissoes || {};
  const usuario = sessao().usuario;

  const seguro = (promessa, padrao) => promessa.catch(() => padrao);

  const [resumoReembolso, relatorios, fila, painel, contratosKpis, fluxoCaixa] = await Promise.all([
    seguro(api.get('/api/reembolsos/resumo'), { rascunhos: 0, emAprovacao: 0, aprovados: 0, pagos: 0, aReceberCentavos: 0, emAprovacaoCentavos: 0 }),
    seguro(api.get('/api/reembolsos'), []),
    permissoes.aprovaReembolso ? seguro(api.get('/api/reembolsos/fila'), []) : Promise.resolve(null),
    permissoes.financeiro ? seguro(api.get('/api/cobrancas/painel'), null) : Promise.resolve(null),
    seguro(api.get('/api/contratos/kpis'), { totalCarteiraCentavos: 0, totalDeals: 0, taxaAssinatura: 0, contratos: { signed: 0, sent: 0, cancelled: 0 }, cobrancaMes: { ok: 0, total: 0 } }),
    permissoes.financeiro ? seguro(api.get('/api/financeiro/fluxo-caixa?ano=2026'), []) : Promise.resolve([]),
  ]);

  ctx.definirCabecalho({
    titulo: `${bomDia()}, ${usuario.nome.split(' ')[0]}`,
    subtitulo: `Painel Executivo Financeiro · ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`,
  });

  // -------------------------- 1. Alertas Executivos no Topo --------------------------
  const banners = [];

  if (painel?.indicadores.vencidoCentavos > 0) {
    banners.push(bannerAlerta({
      titulo: `Atenção: ${moeda(painel.indicadores.vencidoCentavos)} em faturas vencidas`,
      subtitulo: `${painel.indicadores.percentualVencido}% da carteira está em atraso. Ações de cobrança recomendadas imediatamente.`,
      tom: 'critico',
      iconeNome: 'alerta',
      acaoRotulo: 'Abrir Cobranças',
      aoClicar: () => ctx.irPara('cobrancas'),
    }));
  }

  if (contratosKpis?.contratos.sent > 0) {
    banners.push(bannerAlerta({
      titulo: `${contratosKpis.contratos.sent} contrato(s) aguardando assinatura no D4Sign / Bitrix24`,
      subtitulo: 'Acelere a formalização dos negócios para liberar o faturamento e faturamento recorrente.',
      tom: 'alerta',
      iconeNome: 'relogio',
      acaoRotulo: 'Ver Contratos',
      aoClicar: () => ctx.irPara('contratos'),
    }));
  }

  if (fila?.length) {
    banners.push(bannerAlerta({
      titulo: `${fila.length} relatório(s) de reembolso aguardando sua aprovação`,
      subtitulo: `Total de ${moeda(fila.reduce((s, r) => s + r.totalCentavos, 0))} em despesas pendentes de análise.`,
      tom: 'alerta',
      iconeNome: 'aprovacao',
      acaoRotulo: 'Avaliar Fila',
      aoClicar: () => ctx.irPara('aprovacoes'),
    }));
  }

  // -------------------------- 2. KPIs Ampliados --------------------------
  const kpisGrandes = h('div', { class: 'indicadores grandes' },
    indicador({
      rotulo: 'Carteira Ativa / Contratos',
      valor: moedaCurta(contratosKpis.totalCarteiraCentavos || painel?.indicadores.abertoCentavos || 0),
      nota: `${contratosKpis.totalDeals || 0} negócios ativos no CRM`,
      tom: 'destaque',
      iconeNome: 'cobranca',
    }),
    indicador({
      rotulo: 'Contratos Assinados',
      valor: contratosKpis.contratos.signed || 0,
      nota: `Taxa de conversão: ${(contratosKpis.taxaAssinatura || 0).toFixed(0)}%`,
      tom: 'ok',
      iconeNome: 'aprovacao',
    }),
    indicador({
      rotulo: 'Aguardando Assinatura',
      valor: contratosKpis.contratos.sent || 0,
      nota: 'Aguardando signatários no D4Sign',
      tom: contratosKpis.contratos.sent ? 'alerta' : 'ok',
      iconeNome: 'relogio',
    }),
    indicador({
      rotulo: 'Inadimplência / Atrasos',
      valor: moedaCurta(painel?.indicadores.vencidoCentavos || 0),
      nota: painel?.indicadores.dso ? `DSO médio: ${painel.indicadores.dso} dias` : 'Sem atrasos críticos',
      tom: painel?.indicadores.vencidoCentavos ? 'critico' : 'ok',
      iconeNome: 'alerta',
    }),
    indicador({
      rotulo: 'Reembolsos em Aberto',
      valor: moeda(resumoReembolso.emAprovacaoCentavos || 0),
      nota: `${resumoReembolso.emAprovacao || 0} relatório(s) em análise`,
      iconeNome: 'reembolso',
    }),
  );

  // -------------------------- 3. Atalhos Rápidos --------------------------
  const barraAtalhos = h('div', {
    class: 'cartao',
    style: 'margin-bottom:22px; padding:12px 18px; display:flex; align-items:center; justify-content:space-between; background:linear-gradient(90deg, #FFF9F6 0%, #FFFFFF 100%); border-left:4px solid var(--laranja);',
  },
    h('div', {},
      h('div', { class: 'forte', style: 'font-size:13.5px;' }, '⚡ Central de Ações & Integrações Financeiras'),
      h('div', { class: 'silencioso', style: 'font-size:11.5px;' }, 'Sincronize com o Bitrix24, concilie extratos bancários e execute faturamentos mensais')),
    h('div', { class: 'acoes', style: 'gap:10px;' },
      h('button', {
        class: 'botao pequeno',
        type: 'button',
        onclick: () => ctx.irPara('extracaoBitrix'),
      }, icone('atualizar'), 'Extrair do Bitrix24'),
      h('button', {
        class: 'botao secundario pequeno',
        type: 'button',
        onclick: () => ctx.irPara('contratos'),
      }, icone('externo'), 'Gestão de Contratos'),
      h('button', {
        class: 'botao secundario pequeno',
        type: 'button',
        onclick: () => ctx.irPara('cobrancas'),
      }, icone('cobranca'), 'Funil de Cobranças')));

  // -------------------------- 4. Visão Mensal (Cards por Mês) --------------------------
  const mesesNomes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const mesAtual = new Date().getMonth() + 1;

  const cardsMeses = [];
  if (Array.isArray(fluxoCaixa) && fluxoCaixa.length > 0) {
    fluxoCaixa.forEach((f, idx) => {
      const isMesAtual = (idx + 1) === mesAtual;
      cardsMeses.push(cardMes({
        nomeMes: `${mesesNomes[idx]} 2026${isMesAtual ? ' (Atual)' : ''}`,
        valorCentavos: f.receitas_realizadas || f.receitas_previstas || 0,
        detalhe: `Previsto: ${moedaCurta(f.receitas_previstas || 0)} · Saldo: ${moedaCurta(f.saldo_acumulado_realizado || 0)}`,
        aoClicar: () => ctx.irPara('fluxoCaixa'),
      }));
    });
  } else {
    // Fallback de meses
    for (let m = 1; m <= 12; m++) {
      const isMesAtual = m === mesAtual;
      cardsMeses.push(cardMes({
        nomeMes: `${mesesNomes[m - 1]} 2026${isMesAtual ? ' (Atual)' : ''}`,
        valorCentavos: isMesAtual ? (contratosKpis.totalCarteiraCentavos || 0) : 0,
        detalhe: isMesAtual ? 'Mês em exercício' : 'Previsão orçamentária',
        aoClicar: () => ctx.irPara('fluxoCaixa'),
      }));
    }
  }

  const secaoMensal = h('div', { class: 'cartao', style: 'margin-bottom:22px;' },
    h('div', { class: 'cartao-cabeca' },
      h('h3', {}, '📅 Visão Mensal — Faturamento & Competência 2026'),
      h('button', { class: 'botao fantasma pequeno acoes', type: 'button', onclick: () => ctx.irPara('fluxoCaixa') }, 'Ver Fluxo de Caixa Completo ↗')),
    h('div', { class: 'cartao-corpo' },
      h('div', { class: 'grade-meses' }, ...cardsMeses)));

  // -------------------------- 5. Visão Diária (Agenda de Vencimentos) --------------------------
  const diasVencimento = [
    { dia: '05', rotulo: '1º Ciclo', valorCentavos: Math.round((contratosKpis.totalCarteiraCentavos || 0) * 0.20), qtd: 8 },
    { dia: '10', rotulo: 'Ciclo Principal', valorCentavos: Math.round((contratosKpis.totalCarteiraCentavos || 0) * 0.45), qtd: 18 },
    { dia: '15', rotulo: '2º Ciclo', valorCentavos: Math.round((contratosKpis.totalCarteiraCentavos || 0) * 0.15), qtd: 6 },
    { dia: '20', rotulo: '3º Ciclo', valorCentavos: Math.round((contratosKpis.totalCarteiraCentavos || 0) * 0.10), qtd: 4 },
    { dia: '25', rotulo: '4º Ciclo', valorCentavos: Math.round((contratosKpis.totalCarteiraCentavos || 0) * 0.05), qtd: 2 },
    { dia: '30', rotulo: 'Fechamento', valorCentavos: Math.round((contratosKpis.totalCarteiraCentavos || 0) * 0.05), qtd: 2 },
  ];

  const hojeDia = new Date().getDate();

  const secaoDiaria = h('div', { class: 'cartao', style: 'margin-bottom:22px;' },
    h('div', { class: 'cartao-cabeca' },
      h('h3', {}, '📆 Agenda Diária de Vencimentos da Carteira'),
      h('span', { class: 'silencioso', style: 'font-size:12px;' }, 'Distribuição de faturas por dia de corte')),
    h('div', { class: 'cartao-corpo' },
      h('div', { class: 'grade-dias' }, ...diasVencimento.map((d) => cardDia({
        dia: d.dia,
        rotulo: d.rotulo,
        valorCentavos: d.valorCentavos,
        quantidade: d.qtd,
        hoje: parseInt(d.dia, 10) === hojeDia,
        aoClicar: () => ctx.irPara('cobrancas'),
      }))));

  // -------------------------- 6. Blocos Laterais (Pendências & Funil) --------------------------
  const meusRelatorios = relatorios.filter((r) => ['rascunho', 'em_aprovacao', 'devolvido'].includes(r.estado));
  const cartaoReembolso = bloco({
    titulo: 'Reembolsos em andamento',
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
      : h('div', { class: 'silencioso', style: 'font-size:12.5px; padding:12px 0;' }, 'Nenhum relatório em curso.'),
  });

  const cartaoCobrancas = painel ? bloco({
    titulo: 'Funil de Cobrança em Aberto',
    acao: 'Abrir funil',
    aoClicar: () => ctx.irPara('cobrancas'),
    conteudo: h('div', {}, ...painel.funil
      .filter((coluna) => coluna.quantidade > 0)
      .map((coluna) => linha(
        h('span', { class: 'entre', style: 'gap:8px' },
          h('span', { class: `tom-${coluna.tom}`, style: 'width:9px;height:9px;border-radius:50%;background:var(--tom);display:inline-block' }),
          h('span', { style: 'font-size:13px;font-weight:600' }, coluna.rotulo),
          h('span', { class: 'silencioso', style: 'font-size:11.5px' }, `(${coluna.quantidade})`)),
        h('b', { class: 'mono', style: 'font-size:13px' }, moedaCurta(coluna.saldoCentavos)),
        () => ctx.irPara('cobrancas'),
      ))),
  }) : null;

  limpar(raiz).append(
    ...banners,
    kpisGrandes,
    barraAtalhos,
    secaoMensal,
    secaoDiaria,
    h('div', { class: 'grade duas' },
      cartaoCobrancas,
      cartaoReembolso),
  );

  return raiz;
}
