import { api } from '../nucleo/api.js';
import {
  h, limpar, icone, toast, modal, moeda, moedaCurta, dataHora,
  carregando, etiqueta, indicador, aviso, vazio,
} from '../nucleo/ui.js';

// ---------------------------------------------------------------------------
// Extração & Sincronização Bitrix24
// Baseado no modelo robusto do Acompanhamentos-Atlasgr-Comercial,
// com foco exclusivo em contratos, cobranças e finanças da AtlasGR.
// ---------------------------------------------------------------------------

let ultimosDealsExtraidos = [];
let metricasUltimaExtracao = null;

function exportarCsv(deals) {
  if (!deals || !deals.length) {
    toast('Nenhum dado para exportar.', 'erro');
    return;
  }
  const cabecalhos = [
    'ID Deal', 'Título', 'Cliente/Empresa', 'Contato', 'Email', 'Documento',
    'Valor (R$)', 'Estágio', 'Status Contrato', 'Data Assinatura', 'Data Fechamento', 'Data Criação'
  ];
  const linhas = deals.map((d) => [
    d.dealId,
    `"${(d.titulo || '').replace(/"/g, '""')}"`,
    `"${(d.empresaNome || '').replace(/"/g, '""')}"`,
    `"${(d.contatoNome || '').replace(/"/g, '""')}"`,
    `"${(d.contatoEmail || '').replace(/"/g, '""')}"`,
    `"${(d.documento || '').replace(/"/g, '""')}"`,
    (d.valorCentavos / 100).toFixed(2),
    `"${(d.estagioId || '').replace(/"/g, '""')}"`,
    `"${(d.statusContrato || '').replace(/"/g, '""')}"`,
    d.dataContratoAssinado || '',
    d.dataFechamento || '',
    d.dataCriacao || '',
  ]);

  const csvContent = '\uFEFF' + [cabecalhos.join(';'), ...linhas.map((l) => l.join(';'))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `extracao-bitrix-atlasgr-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Arquivo CSV baixado com sucesso!', 'ok');
}

function exportarJson(deals) {
  if (!deals || !deals.length) {
    toast('Nenhum dado para exportar.', 'erro');
    return;
  }
  const blob = new Blob([JSON.stringify(deals, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `extracao-bitrix-atlasgr-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Arquivo JSON baixado com sucesso!', 'ok');
}

export async function montar(ctx) {
  const raiz = h('div', {});
  const areaResultados = h('div', { style: 'margin-top:20px' });

  // ------------------------- Filtros & Controles -------------------------
  const selOrigem = h('select', {},
    h('option', { value: 'atlasgr' }, 'AtlasGR (Principal)'),
    h('option', { value: 'totaltrac' }, 'Total Trac'),
  );

  const selCategoria = h('select', {},
    h('option', { value: '20' }, '20 — Financeiro (Contratos & Cobrança)'),
    h('option', { value: '0' }, '0 — Comercial (Oportunidades & Ganhos)'),
    h('option', { value: '50' }, '50 — Perfil Securitário'),
    h('option', { value: '44' }, '44 — Financeiro (Reembolsos)'),
  );

  const selEstagio = h('select', {},
    h('option', { value: '' }, 'Todos os estágios'),
  );

  const selPreset = h('select', {},
    h('option', { value: 'todas' }, 'Todo o histórico (sem filtro de data)'),
    h('option', { value: 'mes_atual' }, 'Mês atual'),
    h('option', { value: 'ultimos_30_dias' }, 'Últimos 30 dias'),
    h('option', { value: 'semana_atual' }, 'Semana atual'),
    h('option', { value: 'personalizado' }, 'Personalizado (De / Até)'),
  );

  const inputDataInicio = h('input', { type: 'date', style: 'display:none' });
  const inputDataFim = h('input', { type: 'date', style: 'display:none' });
  const labelDeAte = h('span', { style: 'display:none; font-size:12px; color:var(--texto3); margin:0 4px;' }, 'até');

  const atualizarVisibilidadeDatas = () => {
    const p = selPreset.value;
    const hoje = new Date();
    if (p === 'mes_atual') {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
      const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);
      inputDataInicio.value = inicio;
      inputDataFim.value = fim;
      inputDataInicio.style.display = 'none';
      inputDataFim.style.display = 'none';
      labelDeAte.style.display = 'none';
    } else if (p === 'ultimos_30_dias') {
      const inicio = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const fim = hoje.toISOString().slice(0, 10);
      inputDataInicio.value = inicio;
      inputDataFim.value = fim;
      inputDataInicio.style.display = 'none';
      inputDataFim.style.display = 'none';
      labelDeAte.style.display = 'none';
    } else if (p === 'semana_atual') {
      const diaSemana = hoje.getDay();
      const diff = diaSemana === 0 ? -6 : 1 - diaSemana;
      const segunda = new Date(hoje);
      segunda.setDate(hoje.getDate() + diff);
      const domingo = new Date(segunda);
      domingo.setDate(segunda.getDate() + 6);
      inputDataInicio.value = segunda.toISOString().slice(0, 10);
      inputDataFim.value = domingo.toISOString().slice(0, 10);
      inputDataInicio.style.display = 'none';
      inputDataFim.style.display = 'none';
      labelDeAte.style.display = 'none';
    } else if (p === 'todas') {
      inputDataInicio.value = '';
      inputDataFim.value = '';
      inputDataInicio.style.display = 'none';
      inputDataFim.style.display = 'none';
      labelDeAte.style.display = 'none';
    } else {
      inputDataInicio.style.display = 'inline-block';
      inputDataFim.style.display = 'inline-block';
      labelDeAte.style.display = 'inline-block';
    }
  };

  selPreset.addEventListener('change', atualizarVisibilidadeDatas);

  const carregarEstagiosDaCategoria = async () => {
    try {
      const res = await api.get(`/api/bitrix/estagios?categoriaId=${selCategoria.value}&origem=${selOrigem.value}`);
      limpar(selEstagio);
      (res.estagios || []).forEach((est) => {
        selEstagio.append(h('option', { value: est.code }, est.label));
      });
    } catch (e) {
      console.error('Erro ao carregar estágios:', e);
    }
  };

  selCategoria.addEventListener('change', carregarEstagiosDaCategoria);
  selOrigem.addEventListener('change', carregarEstagiosDaCategoria);

  // Botão de Extração
  const btnExtrair = h('button', { class: 'botao', type: 'button', style: 'height:38px; margin-top:24px;' },
    icone('atualizar'), '⚡ Extrair do Bitrix');

  // Barra de status / progresso
  const barraStatus = h('div', { class: 'silencioso', style: 'font-size:12px; margin-top:8px;' });

  // ------------------------- Execução da Extração -------------------------
  async function executarExtracao() {
    btnExtrair.disabled = true;
    btnExtrair.textContent = 'Extraindo dados...';
    barraStatus.textContent = 'Conectando ao Bitrix24 e recuperando registros financeiros...';
    limpar(areaResultados).append(carregando());

    try {
      const payload = {
        origem: selOrigem.value,
        categoriaId: selCategoria.value,
        estagioId: selEstagio.value,
        dataInicio: inputDataInicio.value,
        dataFim: inputDataFim.value,
        campoData: 'DATE_CREATE',
      };

      const resultado = await api.post('/api/bitrix/extrair', payload);
      ultimosDealsExtraidos = resultado.itens || [];
      metricasUltimaExtracao = resultado;

      barraStatus.textContent = `Extração concluída: ${resultado.totalRegistros} negócio(s) encontrado(s) em ${selOrigem.value === 'atlasgr' ? 'AtlasGR' : 'Total Trac'}.`;
      renderizarResultados(resultado);
      toast(`Extraídos ${resultado.totalRegistros} registros do Bitrix24!`, 'ok');
    } catch (erro) {
      limpar(areaResultados).append(
        h('div', { class: 'aviso critico' }, icone('alerta', 16),
          h('div', {}, h('b', {}, 'Falha na extração do Bitrix: '), erro.message)),
      );
      barraStatus.textContent = 'Erro ao consultar o Bitrix24.';
      toast(erro.message, 'erro');
    } finally {
      btnExtrair.disabled = false;
      btnExtrair.replaceChildren(icone('atualizar'), '⚡ Extrair do Bitrix');
    }
  }

  btnExtrair.addEventListener('click', executarExtracao);

  // ------------------------- Renderização dos Resultados -------------------------
  function renderizarResultados(resultado) {
    limpar(areaResultados);

    const deals = resultado.itens || [];
    if (!deals.length) {
      areaResultados.append(
        h('div', { class: 'cartao' },
          h('div', { class: 'cartao-corpo' },
            vazio('Nenhum negócio encontrado no Bitrix para os filtros selecionados.', 'Tente selecionar outro estágio, categoria ou intervalo de datas.'))),
      );
      return;
    }

    const met = resultado.metricas || {};

    // 1. Indicadores Métricos
    const kpis = h('div', { class: 'indicadores' },
      indicador({ rotulo: 'Negócios Extraídos', valor: resultado.totalRegistros }),
      indicador({ rotulo: 'Valor Total (R$)', valor: moeda(resultado.totalCentavos), tom: 'ok' }),
      indicador({ rotulo: 'Contratos Assinados / Ganhos', valor: met.totalGanhos || 0, tom: 'ok' }),
      indicador({ rotulo: 'Em Aberto / Negociação', valor: met.totalAbertos || 0, tom: met.totalAbertos ? 'alerta' : '' }),
      indicador({ rotulo: 'Ticket Médio', valor: moeda(resultado.ticketMedioCentavos) }),
      indicador({ rotulo: 'Taxa de Assinatura', valor: `${met.taxaAssinatura || 0}%` }),
    );

    // 2. Ações de Importação e Exportação
    const btnImportar = h('button', { class: 'botao', type: 'button' },
      icone('baixar'), '📥 Importar para Carteira / Financeiro');

    btnImportar.addEventListener('click', async () => {
      btnImportar.disabled = true;
      btnImportar.textContent = 'Importando...';
      try {
        const res = await api.post('/api/bitrix/importar', { deals });
        toast(`Sincronizado com sucesso! ${res.novos} novo(s) e ${res.atualizados} atualizado(s) no banco local.`, 'ok');
      } catch (e) {
        toast(`Erro na importação: ${e.message}`, 'erro');
      } finally {
        btnImportar.disabled = false;
        btnImportar.replaceChildren(icone('baixar'), '📥 Importar para Carteira / Financeiro');
      }
    });

    const btnCsv = h('button', { class: 'botao secundario', type: 'button', onclick: () => exportarCsv(deals) }, 'Exportar CSV');
    const btnJson = h('button', { class: 'botao secundario', type: 'button', onclick: () => exportarJson(deals) }, 'Exportar JSON');

    const campoFiltroTabela = h('input', {
      type: 'search',
      placeholder: 'Filtrar na tabela (nome, ID, documento)...',
      style: 'width:280px; font-size:12.5px; height:34px;',
    });

    // 3. Tabela de Deals
    const corpoTabela = h('tbody', {});

    const renderLinhas = (filtroTexto = '') => {
      limpar(corpoTabela);
      const termo = filtroTexto.toLowerCase().trim();

      const filtrados = deals.filter((d) => {
        if (!termo) return true;
        return (d.titulo && d.titulo.toLowerCase().includes(termo))
          || (d.dealId && d.dealId.includes(termo))
          || (d.empresaNome && d.empresaNome.toLowerCase().includes(termo))
          || (d.documento && d.documento.includes(termo));
      });

      if (!filtrados.length) {
        corpoTabela.append(h('tr', {}, h('td', { colspan: 7, style: 'text-align:center; padding:24px;' }, 'Nenhum registro corresponde ao filtro de busca.')));
        return;
      }

      filtrados.forEach((d) => {
        let badgeTom = 'neutro';
        let badgeRotulo = 'Em andamento';
        if (d.statusContrato === 'assinado') {
          badgeTom = 'ok';
          badgeRotulo = 'Contrato Assinado';
        } else if (d.statusContrato === 'aguardando_assinatura') {
          badgeTom = 'alerta';
          badgeRotulo = 'Aguardando Assinatura';
        } else if (d.statusContrato === 'cancelado') {
          badgeTom = 'critico';
          badgeRotulo = 'Cancelado';
        }

        corpoTabela.append(h('tr', {},
          h('td', {},
            h('div', { class: 'forte' }, d.empresaNome || d.titulo),
            h('div', { class: 'silencioso', style: 'font-size:11px' }, `Deal #${d.dealId}${d.documento ? ` · CNPJ/CPF: ${d.documento}` : ''}`)),
          h('td', { class: 'num' }, d.valorCentavos ? moeda(d.valorCentavos) : 'R$ 0,00'),
          h('td', {}, etiqueta(badgeRotulo, badgeTom)),
          h('td', { class: 'silencioso', style: 'font-size:12px' }, d.dataContratoAssinado ? d.dataContratoAssinado.slice(0, 10) : '—'),
          h('td', { class: 'silencioso', style: 'font-size:12px' }, d.dataFechamento ? d.dataFechamento.slice(0, 10) : '—'),
          h('td', { class: 'silencioso', style: 'font-size:12px' }, d.contatoNome ? `${d.contatoNome}${d.contatoEmail ? ` (${d.contatoEmail})` : ''}` : '—'),
          h('td', {},
            h('a', {
              href: `https://atlasgr.bitrix24.com.br/crm/deal/details/${d.dealId}/`,
              target: '_blank',
              class: 'botao secundario pequeno',
              style: 'text-decoration:none;',
            }, 'Abrir no Bitrix ↗')),
        ));
      });
    };

    campoFiltroTabela.addEventListener('input', (e) => renderLinhas(e.target.value));
    renderLinhas();

    areaResultados.append(
      kpis,
      h('div', { class: 'cartao', style: 'margin-top:16px;' },
        h('div', { class: 'cartao-cabeca' },
          h('h3', {}, `Registros Extraídos (${deals.length})`),
          h('div', { class: 'acoes', style: 'gap:10px;' },
            campoFiltroTabela,
            btnCsv,
            btnJson,
            btnImportar)),
        h('div', { class: 'cartao-corpo sem-espaco' },
          h('div', { class: 'tabela-envolve' },
            h('table', {},
              h('thead', {},
                h('tr', {},
                  h('th', {}, 'Negócio / Cliente'),
                  h('th', { class: 'num' }, 'Valor'),
                  h('th', {}, 'Status Contrato'),
                  h('th', {}, 'Data Assinatura'),
                  h('th', {}, 'Fechamento'),
                  h('th', {}, 'Contato'),
                  h('th', {}, 'Ações'))),
              corpoTabela)))),
    );
  }

  // ------------------------- Montagem da Página -------------------------
  ctx.definirCabecalho({
    titulo: 'Extração Bitrix24',
    subtitulo: 'Extraia negócios, contratos e itens financeiros diretamente do CRM Bitrix24 com sincronização bidirecional',
  });

  const cardConfiguracao = h('div', { class: 'cartao' },
    h('div', { class: 'cartao-cabeca' },
      h('h3', {}, 'Parâmetros de Extração'),
      h('span', { class: 'silencioso', style: 'font-size:12px;' }, 'Conexão direta via Webhook Bitrix24 REST API')),
    h('div', { class: 'cartao-corpo' },
      h('div', { class: 'row', style: 'gap:16px; align-items:flex-start;' },
        h('label', { class: 'campo', style: 'flex:1; min-width:200px;' },
          h('span', {}, 'Origem Bitrix'), selOrigem),
        h('label', { class: 'campo', style: 'flex:2; min-width:280px;' },
          h('span', {}, 'Funil / Categoria'), selCategoria),
        h('label', { class: 'campo', style: 'flex:2; min-width:240px;' },
          h('span', {}, 'Estágio do Funil'), selEstagio)),
      h('div', { class: 'row', style: 'gap:16px; align-items:center; margin-top:12px;' },
        h('label', { class: 'campo', style: 'flex:2; min-width:260px;' },
          h('span', {}, 'Período'), selPreset),
        h('div', { class: 'linha-campos', style: 'flex:2; margin-top:20px;' },
          inputDataInicio, labelDeAte, inputDataFim),
        btnExtrair),
      barraStatus));

  raiz.append(cardConfiguracao, areaResultados);

  // Inicializa os estágios da categoria padrão (20 - Financeiro)
  await carregarEstagiosDaCategoria();

  return raiz;
}
