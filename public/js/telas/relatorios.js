import { api, comQuery } from '../nucleo/api.js';
import {
  h, limpar, carregando, icone, moeda, moedaCurta, indicador, etiqueta, mesAnoExtenso,
} from '../nucleo/ui.js';
import { botaoSalvar } from '../nucleo/exportar.js';
import { botaoAnaliseIA } from '../nucleo/analiseIA.js';

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

// ------------------------------------------------------------------
// Renderização do DRE Anual (12 Meses + Total + Média)
// ------------------------------------------------------------------
function renderizarDREAnual(dados, ano, aoTrocarAno, modoVisao, aoTrocarModo) {
  if (!dados || !dados.meses) {
    return h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' }, secaoConstrucao('DRE')));
  }

  const { meses, totalAnual, mediaMensal } = dados;

  // KPIs de topo do DRE
  const kpis = h('div', { class: 'indicadores', style: 'margin-bottom: 16px;' },
    indicador({
      rotulo: `Receita Bruta (${ano})`,
      valor: moeda(totalAnual.receitaBruta),
      tom: 'ok',
    }),
    indicador({
      rotulo: `EBITDA (${ano})`,
      valor: moeda(totalAnual.ebitda),
      subtexto: `Margem: ${totalAnual.margemEbitda}%`,
      tom: totalAnual.ebitda >= 0 ? 'ok' : 'critico',
    }),
    indicador({
      rotulo: `Lucro Líquido (${ano})`,
      valor: moeda(totalAnual.lucroLiquido),
      subtexto: `Margem: ${totalAnual.margemLiquida}%`,
      tom: totalAnual.lucroLiquido >= 0 ? 'ok' : 'critico',
    }),
    indicador({
      rotulo: `Média Mensal Faturamento`,
      valor: moeda(mediaMensal.receitaBruta),
      tom: 'neutro',
    })
  );

  // Linhas da DRE
  const definicaoLinhas = [
    { chave: 'receitaBruta', rotulo: '(+) Receita Operacional Bruta', classe: 'forte', tom: 'destaque-positivo' },
    { chave: 'deducoes', rotulo: '(-) Deduções e Impostos', classe: 'texto-suave', negativo: true },
    { chave: 'receitaLiquida', rotulo: '(=) Receita Operacional Líquida', classe: 'forte subtotal' },
    { chave: 'custosServicos', rotulo: '(-) Custos dos Serviços Prestados (CSP)', classe: 'texto-suave', negativo: true },
    { chave: 'lucroBruto', rotulo: '(=) Lucro Bruto', classe: 'forte subtotal', margem: 'margemBruta' },
    { chave: 'despesasOperacionais', rotulo: '(-) Despesas Operacionais & Reembolsos', classe: 'texto-suave', negativo: true },
    { chave: 'ebitda', rotulo: '(=) EBITDA / Resultado Operacional', classe: 'forte destaque-ebitda', margem: 'margemEbitda' },
    { chave: 'resultadoFinanceiro', rotulo: '(+/-) Resultado Financeiro Líquido', classe: 'texto-suave' },
    { chave: 'lucroLiquido', rotulo: '(=) Lucro Líquido do Exercício', classe: 'forte destaque-final', margem: 'margemLiquida' },
  ];

  // Cabeçalho da tabela
  const cabecalhos = [
    h('th', { style: 'min-width: 260px; text-align: left; position: sticky; left: 0; background: var(--fundo-card, #fff); z-index: 2;' }, 'Estrutura DRE'),
    ...meses.map((m) => h('th', { class: 'num', style: 'min-width: 95px;' }, m.nomeMes)),
    h('th', { class: 'num', style: 'min-width: 120px; font-weight: 700; background: rgba(0,0,0,0.03);' }, 'Total Anual'),
    h('th', { class: 'num', style: 'min-width: 110px; font-weight: 700; background: rgba(0,0,0,0.03);' }, 'Média Mensal'),
  ];

  // Linhas do corpo da tabela
  const corpoTabela = h('tbody', {});

  definicaoLinhas.forEach((def) => {
    const celulasMeses = meses.map((m) => {
      const valor = m[def.chave] || 0;
      let textoValor = moeda(valor);
      if (def.negativo && valor > 0) textoValor = `(${textoValor})`;
      return h('td', { class: 'num mono' }, textoValor);
    });

    let totalVal = totalAnual[def.chave] || 0;
    let mediaVal = mediaMensal[def.chave] || 0;

    let textoTotal = moeda(totalVal);
    if (def.negativo && totalVal > 0) textoTotal = `(${textoTotal})`;

    let textoMedia = moeda(mediaVal);
    if (def.negativo && mediaVal > 0) textoMedia = `(${textoMedia})`;

    const tr = h('tr', { class: def.classe || '' },
      h('td', {
        class: 'forte',
        style: 'position: sticky; left: 0; background: inherit; z-index: 1;',
      },
        def.rotulo,
        def.margem ? h('span', { class: 'etiqueta neutro', style: 'margin-left: 8px; font-size: 11px;' }, `${totalAnual[def.margem]}%`) : null
      ),
      ...celulasMeses,
      h('td', { class: 'num mono forte', style: 'background: rgba(0,0,0,0.02);' }, textoTotal),
      h('td', { class: 'num mono', style: 'background: rgba(0,0,0,0.02);' }, textoMedia),
    );

    corpoTabela.append(tr);
  });

  // Filtros de Ano e Controles de Visualização
  const barraControles = h('div', {
    style: 'display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px;',
  },
    h('div', { style: 'display: flex; gap: 8px; align-items: center;' },
      h('span', { class: 'texto-suave', style: 'font-weight: 600;' }, 'Ano Exercício:'),
      ...[2024, 2025, 2026, 2027].map((a) => h('button', {
        type: 'button',
        class: `pilula-filtro ${a === ano ? 'on' : ''}`,
        onclick: () => aoTrocarAno(a),
      }, String(a)))
    ),
    h('div', { style: 'display: flex; gap: 8px; align-items: center;' },
      h('button', {
        type: 'button',
        class: `pilula-filtro ${modoVisao === 'anual' ? 'on' : ''}`,
        onclick: () => aoTrocarModo('anual'),
      }, 'Visão Anual (12 Meses)'),
      h('button', {
        type: 'button',
        class: `pilula-filtro ${modoVisao === 'mensal' ? 'on' : ''}`,
        onclick: () => aoTrocarModo('mensal'),
      }, 'Visão Mensal Detalhada'),
      h('button', {
        type: 'button',
        class: 'btn discreto',
        onclick: () => window.print(),
      }, icone('externo', 14), ' Imprimir / PDF')
    )
  );

  return h('div', {},
    barraControles,
    kpis,
    h('div', { class: 'cartao' },
      h('div', { class: 'cartao-cabeca' },
        h('h3', {}, `DRE Gerencial — Exercício ${ano}`),
        h('span', { class: 'texto-suave' }, 'Regime de Competência e Liquidação Consolidado')
      ),
      h('div', { class: 'cartao-corpo sem-espaco' },
        h('div', { class: 'tabela-envolve', style: 'overflow-x: auto; max-width: 100%;' },
          h('table', { class: 'tabela' },
            h('thead', {}, h('tr', {}, ...cabecalhos)),
            corpoTabela
          )
        )
      )
    )
  );
}

// ------------------------------------------------------------------
// Renderização do DRE Mensal
// ------------------------------------------------------------------
function renderizarDREMensal(dados, mesSelecionado, aoTrocarMes, aoTrocarModo) {
  if (!dados || !dados.dre) {
    return h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' }, secaoConstrucao('DRE')));
  }

  const linhas = dados.dre.map((l) => {
    let classeLinha = '';
    if (l.tipo === 'totalizador' || l.tipo === 'subtotal') classeLinha = 'forte';
    if (l.tipo === 'destaque') classeLinha = 'forte destaque-ebitda';
    if (l.tipo === 'resultado_final') classeLinha = 'forte destaque-final';

    return h('tr', { class: classeLinha },
      h('td', { class: 'forte' },
        l.descricao,
        l.margemPercentual !== undefined ? h('span', { class: 'etiqueta neutro', style: 'margin-left: 8px;' }, `${l.margemPercentual}%`) : null
      ),
      h('td', { class: 'num mono' }, moeda(l.valorCentavos))
    );
  });

  const barraControles = h('div', {
    style: 'display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px;',
  },
    h('div', { style: 'display: flex; gap: 8px; align-items: center;' },
      h('span', { class: 'texto-suave', style: 'font-weight: 600;' }, 'Mês de Referência:'),
      h('input', {
        type: 'month',
        value: mesSelecionado,
        class: 'campo-input',
        onchange: (e) => aoTrocarMes(e.target.value),
      })
    ),
    h('div', { style: 'display: flex; gap: 8px; align-items: center;' },
      h('button', {
        type: 'button',
        class: 'pilula-filtro',
        onclick: () => aoTrocarModo('anual'),
      }, 'Ver Visão Anual (12 Meses)'),
      h('button', {
        type: 'button',
        class: 'btn discreto',
        onclick: () => window.print(),
      }, icone('externo', 14), ' Imprimir / PDF')
    )
  );

  return h('div', {},
    barraControles,
    h('div', { class: 'cartao' },
      h('div', { class: 'cartao-cabeca' },
        h('h3', {}, `Demonstração do Resultado do Exercício — ${mesAnoExtenso(mesSelecionado)}`),
        h('span', { class: 'texto-suave' }, 'Visão Mensal Detalhada')
      ),
      h('div', { class: 'cartao-corpo sem-espaco' },
        h('table', { class: 'tabela' },
          h('thead', {},
            h('tr', {},
              h('th', {}, 'Conta / Rubrica Contábil'),
              h('th', { class: 'num' }, 'Valor (R$)')
            )
          ),
          h('tbody', {}, ...linhas)
        )
      )
    )
  );
}

// ------------------------------------------------------------------
// Módulo Principal
// ------------------------------------------------------------------
export async function montar(ctx) {
  const raiz = h('div', {}, carregando());

  let abaAtiva = ctx.parametro || 'dre';
  let anoSelecionado = new Date().getFullYear();
  let agora = new Date();
  let mesSelecionado = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
  let modoVisaoDRE = 'anual'; // 'anual' ou 'mensal'

  async function desenhar() {
    limpar(raiz);

    const abas = h('div', { class: 'abas' },
      aba({ id: 'dre', rotulo: 'DRE (Anual e Mensal)', ativa: abaAtiva === 'dre', aoClicar: irAba }),
      aba({ id: 'fluxo', rotulo: 'Fluxo de Caixa', ativa: abaAtiva === 'fluxo', aoClicar: irAba }),
      aba({ id: 'financeiros', rotulo: 'Financeiros', ativa: abaAtiva === 'financeiros', aoClicar: irAba }),
      aba({ id: 'vendas', rotulo: 'Vendas & Faturamento', ativa: abaAtiva === 'vendas', aoClicar: irAba }),
      aba({ id: 'compras', rotulo: 'Compras', ativa: abaAtiva === 'compras', aoClicar: irAba }),
      aba({ id: 'estoque', rotulo: 'Estoque', ativa: abaAtiva === 'estoque', aoClicar: irAba }),
      aba({ id: 'construtor', rotulo: 'Construtor', ativa: abaAtiva === 'construtor', aoClicar: irAba })
    );

    const painel = h('div', { style: 'margin-top: 16px' }, carregando());
    raiz.append(abas, painel);

    try {
      if (abaAtiva === 'dre') {
        limpar(painel);
        if (modoVisaoDRE === 'anual') {
          const dadosAnual = await api.get(comQuery('/api/relatorios/dre-anual', { ano: anoSelecionado }));
          painel.append(renderizarDREAnual(
            dadosAnual,
            anoSelecionado,
            (novoAno) => { anoSelecionado = novoAno; desenhar(); },
            modoVisaoDRE,
            (novoModo) => { modoVisaoDRE = novoModo; desenhar(); }
          ));
        } else {
          const deMes = `${mesSelecionado}-01`;
          const ateMes = `${mesSelecionado}-31`;
          const dadosMensal = await api.get(comQuery('/api/relatorios/dre', { de: deMes, ate: ateMes }));
          painel.append(renderizarDREMensal(
            dadosMensal,
            mesSelecionado,
            (novoMes) => { mesSelecionado = novoMes; desenhar(); },
            (novoModo) => { modoVisaoDRE = novoModo; desenhar(); }
          ));
        }
      } else if (abaAtiva === 'fluxo') {
        const dadosFluxo = await api.get(comQuery('/api/financeiro/fluxo-caixa', { ano: anoSelecionado }));
        limpar(painel).append(
          h('div', { class: 'aviso info' }, icone('info', 16),
            h('div', {}, 'Acesse a aba ', h('b', {}, 'Fluxo de Caixa'), ' no menu lateral para interagir com a projeção detalhada por conta e empresa.')
          )
        );
      } else {
        limpar(painel).append(
          h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' }, secaoConstrucao(abaAtiva)))
        );
      }
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

  ctx.definirCabecalho({
    titulo: 'Central de Relatórios',
    subtitulo: 'Demonstrações financeiras consolidadas, DRE anual e mensal',
    acoes: [
      botaoAnaliseIA('Relatórios DRE', () => {
        return `Ano exercício: ${anoSelecionado}\nModo: ${modoVisaoDRE}\nMês selecionado: ${mesSelecionado}`;
      }, raiz),
    ],
  });

  await desenhar();
  return raiz;
}
