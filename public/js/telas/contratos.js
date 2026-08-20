import { api } from '../nucleo/api.js';
import {
  h, limpar, icone, toast, moeda, moedaCurta, dataHora, mesAno,
  carregando, etiqueta, indicador, bannerAlerta, aviso, vazio,
  cardMes, cardDia,
} from '../nucleo/ui.js';

// ------------------------------------------------------------------
// Contratos & Cobrança: Bitrix24 (Deal) -> D4Sign (Contrato & Assinatura)
// -> Sincronização Bidirecional & Cobrança Mensal (NXFacil).
// ------------------------------------------------------------------

const ABAS = [
  { id: 'geral', rotulo: 'Visão geral & Métricas' },
  { id: 'carteira', rotulo: 'Carteira (Mês & Dia)' },
  { id: 'acoes', rotulo: 'Gerar Contrato (Mapeamento Bitrix)' },
  { id: 'simulador', rotulo: '🎮 Simulador D4Sign (Tempo Real)' },
  { id: 'config', rotulo: 'Configuração & Webhooks' },
];

function modalPopupSucesso(titulo, mensagem, detalhesHtml = null) {
  modal({
    titulo,
    corpo: h('div', { style: 'padding: 16px;' },
      h('div', { style: 'text-align: center; margin-bottom: 16px;' },
        h('div', { style: 'font-size: 44px; margin-bottom: 8px;' }, '🎉'),
        h('h3', { style: 'margin-bottom: 6px;' }, titulo),
        h('p', { class: 'texto-suave' }, mensagem)),
      detalhesHtml || null),
    acoes: [{ rotulo: 'Excelente!', estilo: 'sucesso', aoClicar: (fechar) => fechar() }],
  });
}

const BADGE_CONTRATO = { signed: 'ok', sent: 'alerta', cancelled: 'critico' };

function badgeCobranca(cobranca) {
  if (!cobranca) return etiqueta('sem cobrança', 'neutro');
  const erro = cobranca.boletoStatus === 'error' || cobranca.notaStatus === 'error';
  return etiqueta(`${mesAno(cobranca.mesReferencia)}: boleto ${cobranca.boletoStatus} / nota ${cobranca.notaStatus}`, erro ? 'critico' : 'ok');
}

// -------------------------------- 1. Geral --------------------------------
async function montarGeral(ctx) {
  const [kpis, alertas] = await Promise.all([api.get('/api/contratos/kpis'), api.get('/api/contratos/alertas')]);
  const cobr = kpis.cobrancaMes;

  const listaAlertas = alertas.length
    ? h('div', { class: 'pilha' }, ...alertas.map((a) => aviso(
      a.severidade === 'critico' ? 'critico' : a.severidade === 'atencao' ? 'alerta' : 'info',
      h('div', {}, h('b', {}, a.titulo), h('div', { class: 'silencioso', style: 'margin-top:2px' }, a.subtitulo)),
    )))
    : aviso('ok', h('div', {}, h('b', {}, 'Tudo em ordem. '), 'Nenhuma pendência crítica de contratos ou assinaturas.'));

  return h('div', {},
    h('div', { class: 'indicadores grandes' },
      indicador({ rotulo: 'Total em carteira ativa', valor: moedaCurta(kpis.totalCarteiraCentavos), tom: 'destaque', iconeNome: 'cobranca' }),
      indicador({ rotulo: 'Negócios acompanhados', valor: kpis.totalDeals, iconeNome: 'fonte' }),
      indicador({ rotulo: 'Contratos assinados', valor: kpis.contratos.signed, tom: 'ok', iconeNome: 'aprovacao' }),
      indicador({ rotulo: 'Aguardando assinatura', valor: kpis.contratos.sent, tom: kpis.contratos.sent ? 'alerta' : 'ok', iconeNome: 'relogio' }),
      indicador({ rotulo: 'Taxa de conversão', valor: `${kpis.taxaAssinatura.toFixed(0)}%` }),
      indicador({
        rotulo: `Cobranças (${mesAno(cobr.mesReferencia)})`,
        valor: `${cobr.ok + cobr.mock}/${cobr.total}`,
        tom: cobr.error ? 'critico' : 'ok',
        nota: cobr.error ? `${cobr.error} com erro` : 'rotina pronta',
      })),
    h('div', { class: 'cartao', style: 'margin-top:16px' },
      h('div', { class: 'cartao-cabeca' }, h('h3', {}, 'Alertas & Pendências Contratuais')),
      h('div', { class: 'cartao-corpo' }, listaAlertas)));
}

// ------------------------------- 2. Carteira (Agrupamentos por Mês e Dia) -------------------------------
async function montarCarteira() {
  const carteira = await api.get('/api/contratos/carteira');
  if (!carteira.length) {
    return h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' },
      vazio('Nenhum negócio na carteira ainda', 'Extraia deals pelo menu "Extração Bitrix24" ou gere um contrato pela aba "Gerar Contrato" para visualizar a carteira.')));
  }

  const container = h('div', {});
  let modoVisao = 'todos'; // 'todos' | 'mes' | 'dia' | 'status'

  // Agrupamento por Mês
  const agruparPorMes = () => {
    const meses = {};
    carteira.forEach((d) => {
      const dataRef = d.atualizadoEm || d.contratoAtualizadoEm || new Date().toISOString();
      const chaveMes = dataRef.slice(0, 7); // YYYY-MM
      if (!meses[chaveMes]) meses[chaveMes] = { itens: [], totalCentavos: 0 };
      meses[chaveMes].itens.push(d);
      meses[chaveMes].totalCentavos += (d.valorCentavos || 0);
    });
    return meses;
  };

  // Agrupamento por Dia de Vencimento
  const agruparPorDia = () => {
    const dias = {};
    carteira.forEach((d) => {
      const dia = d.vencimentoDia || '10';
      if (!dias[dia]) dias[dia] = { itens: [], totalCentavos: 0 };
      dias[dia].itens.push(d);
      dias[dia].totalCentavos += (d.valorCentavos || 0);
    });
    return dias;
  };

  // Renderizador principal da carteira
  const renderizar = () => {
    limpar(container);

    // Controles de Visualização
    const botoesFiltro = h('div', { class: 'row', style: 'gap:8px; margin-bottom:18px;' },
      h('button', {
        class: `pilula-filtro ${modoVisao === 'todos' ? 'on' : ''}`,
        type: 'button',
        onclick: () => { modoVisao = 'todos'; renderizar(); },
      }, 'Todos os Contratos'),
      h('button', {
        class: `pilula-filtro ${modoVisao === 'mes' ? 'on' : ''}`,
        type: 'button',
        onclick: () => { modoVisao = 'mes'; renderizar(); },
      }, '📅 Agrupado por Mês'),
      h('button', {
        class: `pilula-filtro ${modoVisao === 'dia' ? 'on' : ''}`,
        type: 'button',
        onclick: () => { modoVisao = 'dia'; renderizar(); },
      }, '📆 Agrupado por Dia de Vencimento'));

    container.append(botoesFiltro);

    if (modoVisao === 'mes') {
      const gruposMes = agruparPorMes();
      const cardsGrid = h('div', { class: 'grade-meses', style: 'margin-bottom:20px;' });

      Object.entries(gruposMes).forEach(([chave, dados]) => {
        const [ano, mes] = chave.split('-');
        const nomeMes = new Date(Number(ano), Number(mes) - 1, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        cardsGrid.append(cardMes({
          nomeMes: nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1),
          valorCentavos: dados.totalCentavos,
          quantidade: dados.itens.length,
          detalhe: `${dados.itens.filter((i) => i.contratoStatus === 'signed').length} contrato(s) assinado(s)`,
        }));
      });

      container.append(cardsGrid);
    } else if (modoVisao === 'dia') {
      const gruposDia = agruparPorDia();
      const cardsDiasGrid = h('div', { class: 'grade-dias', style: 'margin-bottom:20px;' });

      Object.entries(gruposDia).sort(([a], [b]) => Number(a) - Number(b)).forEach(([dia, dados]) => {
        cardsDiasGrid.append(cardDia({
          dia: String(dia).padStart(2, '0'),
          rotulo: `Vencimento Dia ${dia}`,
          valorCentavos: dados.totalCentavos,
          quantidade: dados.itens.length,
        }));
      });

      container.append(cardsDiasGrid);
    }

    // Tabela detalhada
    const corpo = h('tbody', {});
    for (const d of carteira) {
      corpo.append(h('tr', {},
        h('td', {},
          h('div', { class: 'forte' }, d.clienteNome || d.titulo || `Deal ${d.dealId}`),
          h('div', { class: 'silencioso', style: 'font-size:11px' }, `Deal #${d.dealId}${d.clienteEmail ? ` · ${d.clienteEmail}` : ''}`)),
        h('td', { class: 'num' }, d.valorCentavos != null ? moeda(d.valorCentavos) : '—'),
        h('td', {}, etiqueta(d.contratoStatusRotulo || 'Pendente', BADGE_CONTRATO[d.contratoStatus] || 'neutro')),
        h('td', { class: 'silencioso', style: 'font-size:12px' }, `Dia ${d.vencimentoDia || '10'}`),
        h('td', {}, badgeCobranca(d.ultimaCobranca)),
        h('td', { class: 'silencioso', style: 'font-size:12px' }, dataHora(d.atualizadoEm)),
        h('td', {},
          h('a', {
            href: `https://atlasgr.bitrix24.com.br/crm/deal/details/${d.dealId}/`,
            target: '_blank',
            class: 'botao secundario pequeno',
            style: 'text-decoration:none;',
          }, 'Bitrix ↗')),
      ));
    }

    container.append(
      h('div', { class: 'cartao' },
        h('div', { class: 'cartao-cabeca' },
          h('h3', {}, `Carteira de Negócios e Contratos (${carteira.length})`),
          h('span', { class: 'silencioso', style: 'font-size:12px;' }, 'Sincronizado automaticamente com CRM')),
        h('div', { class: 'cartao-corpo sem-espaco' },
          h('div', { class: 'tabela-envolve' },
            h('table', {},
              h('thead', {},
                h('tr', {},
                  h('th', {}, 'Cliente / Razão Social'),
                  h('th', { class: 'num' }, 'Valor (R$)'),
                  h('th', {}, 'Contrato D4Sign'),
                  h('th', {}, 'Vencimento'),
                  h('th', {}, 'Cobrança'),
                  h('th', {}, 'Atualizado em'),
                  h('th', {}, 'CRM'))),
              corpo)))),
    );
  };

  renderizar();
  return container;
}

// -------------------------------- 3. Ações & Mapeamento Automático --------------------------------
function montarAcoes(ctx) {
  const campoDeal = h('input', { type: 'text', placeholder: 'ex.: 26032 ou 25996', style: 'font-size:13.5px;' });
  const selOrigem = h('select', { style: 'width:160px;' },
    h('option', { value: 'atlasgr' }, 'AtlasGR'),
    h('option', { value: 'totaltrac' }, 'Total Trac'),
  );

  const btnMapear = h('button', { class: 'botao secundario', type: 'button' },
    icone('busca'), 'Mapear Campos do Bitrix24');

  const btnGerar = h('button', { class: 'botao', type: 'button', style: 'display:none;' },
    icone('enviar'), 'Gerar e Enviar Contrato no D4Sign');

  const areaPrevia = h('div', { style: 'margin-top:16px;' });
  let dadosMapeadosAtuais = null;

  btnMapear.addEventListener('click', async () => {
    const dealId = campoDeal.value.trim();
    if (!dealId) return toast('Informe o ID do negócio no Bitrix24.', 'erro');

    btnMapear.disabled = true;
    btnMapear.textContent = 'Mapeando dados...';
    limpar(areaPrevia).append(carregando('Buscando negócio, empresa e signatário no Bitrix24...'));

    try {
      const res = await api.get(`/api/contratos/previa-campos/${dealId}?origem=${selOrigem.value}`);
      dadosMapeadosAtuais = res.previa;

      limpar(areaPrevia);
      btnGerar.style.display = 'inline-flex';

      const vars = dadosMapeadosAtuais.variaveisD4Sign || {};

      areaPrevia.append(
        h('div', { class: 'cartao', style: 'border:1px solid #FFE0D2; background:#FFFBF9;' },
          h('div', { class: 'cartao-cabeca' },
            h('h3', {}, `✅ Campos Identificados para o Contrato (Deal #${dealId})`),
            etiqueta('Mapeamento Concluído', 'ok')),
          h('div', { class: 'cartao-corpo' },
            h('div', { class: 'grade duas', style: 'gap:14px;' },
              h('div', {},
                h('div', { class: 'campo' }, h('span', {}, 'Razão Social / Empresa'), h('input', { type: 'text', value: vars.RAZAO_SOCIAL || '', disabled: true })),
                h('div', { class: 'campo' }, h('span', {}, 'CNPJ'), h('input', { type: 'text', value: vars.CNPJ || '', disabled: true })),
                h('div', { class: 'campo' }, h('span', {}, 'Endereço Completo'), h('input', { type: 'text', value: vars.ENDERECO_COMPLETO || '', disabled: true })),
                h('div', { class: 'campo' }, h('span', {}, 'Plano / Solução'), h('input', { type: 'text', value: vars.PLANO || '', disabled: true }))),
              h('div', {},
                h('div', { class: 'campo' }, h('span', {}, 'Nome do Signatário'), h('input', { type: 'text', value: vars.NOME_SIGNATARIO || '', disabled: true })),
                h('div', { class: 'campo' }, h('span', {}, 'E-mail para Assinatura'), h('input', { type: 'text', value: vars.EMAIL_SIGNATARIO || '', disabled: true })),
                h('div', { class: 'campo' }, h('span', {}, 'Valor Mensal (R$)'), h('input', { type: 'text', value: vars.VALOR_MENSAL || '', disabled: true })),
                h('div', { class: 'campo' }, h('span', {}, 'Dia de Vencimento'), h('input', { type: 'text', value: `Todo dia ${vars.DIA_VENCIMENTO || '10'}`, disabled: true })))),
            h('div', { class: 'aviso info', style: 'margin-top:12px;' },
              icone('relogio', 16),
              h('div', {},
                h('b', {}, 'Disparo Automático: '),
                'Ao clicar no botão abaixo, o contrato será criado a partir da minuta padrão do D4Sign, os campos acima serão preenchidos e o signatário receberá o link por e-mail.')))),
      );

      toast('Campos mapeados com sucesso!', 'ok');
    } catch (e) {
      limpar(areaPrevia).append(
        h('div', { class: 'aviso critico' }, icone('alerta', 16),
          h('div', {}, h('b', {}, 'Erro ao buscar no Bitrix: '), e.message)),
      );
      btnGerar.style.display = 'none';
      toast(e.message, 'erro');
    } finally {
      btnMapear.disabled = false;
      btnMapear.replaceChildren(icone('busca'), 'Mapear Campos do Bitrix24');
    }
  });

  btnGerar.addEventListener('click', async () => {
    const dealId = campoDeal.value.trim();
    if (!dealId) return toast('Informe o ID do negócio.', 'erro');

    btnGerar.disabled = true;
    btnGerar.textContent = 'Enviando para o D4Sign...';

    try {
      const resultado = await api.post('/api/contratos/gerar-contrato', { dealId, origem: selOrigem.value });
      modalPopupSucesso(
        'Contrato Gerado no D4Sign!',
        `O contrato do Deal #${dealId} foi gerado e enviado para assinatura com sucesso.`,
        h('div', { class: 'aviso ok' }, `Documento UUID: ${resultado.documentoUuid || 'D4S-GERADO'}`)
      );
      ctx.recarregar();
    } catch (erro) {
      toast(erro.message, 'erro');
    } finally {
      btnGerar.disabled = false;
      btnGerar.replaceChildren(icone('enviar'), 'Gerar e Enviar Contrato no D4Sign');
    }
  });

  const btnCobranca = h('button', { class: 'botao', type: 'button' }, 'Executar cobrança mensal agora');
  btnCobranca.addEventListener('click', async () => {
    btnCobranca.disabled = true;
    btnCobranca.textContent = 'Executando...';
    try {
      const resumo = await api.post('/api/contratos/rodar-cobranca');
      modalPopupSucesso(
        'Rotina de Cobrança Concluída!',
        `Foram processados ${resumo.total} negócio(s) com emissão de boletos/NFs para ${mesAno(resumo.mesReferencia)}.`
      );
      ctx.recarregar();
    } catch (erro) {
      toast(erro.message, 'erro');
    } finally {
      btnCobranca.disabled = false;
      btnCobranca.textContent = 'Executar cobrança mensal agora';
    }
  });

  return h('div', {},
    h('div', { class: 'cartao', style: 'margin-bottom:16px;' },
      h('div', { class: 'cartao-cabeca' }, h('h3', {}, '⚡ Extração Rápida Bitrix24')),
      h('div', { class: 'cartao-corpo' },
        h('p', { class: 'silencioso', style: 'margin:0 0 12px;font-size:12.5px' },
          'Extraia negócios e contratos em lote dos funis do Bitrix24 (categorias 20 - Financeiro, 0 - Comercial, 50 - Perfil Securitário).'),
        h('a', { class: 'botao', href: '#/extracaoBitrix', style: 'text-decoration:none; display:inline-flex; align-items:center; gap:8px;' },
          icone('atualizar'), 'Abrir Painel de Extração Bitrix24'))),

    h('div', { class: 'cartao' },
      h('div', { class: 'cartao-cabeca' }, h('h3', {}, 'Gerar e Enviar Contrato com Mapeamento Automático')),
      h('div', { class: 'cartao-corpo' },
        h('p', { class: 'silencioso', style: 'margin:0 0 12px;font-size:12.5px' },
          'Insira o ID do Negócio (Deal ID) do Bitrix24. O sistema busca automaticamente a Empresa, o Signatário, o CNPJ, o Plano e o Valor para gerar o contrato no D4Sign.'),
        h('div', { class: 'linha-campos', style: 'gap:12px; align-items:flex-end;' },
          h('label', { class: 'campo', style: 'flex:1;' }, h('span', {}, 'Origem CRM'), selOrigem),
          h('label', { class: 'campo', style: 'flex:2;' }, h('span', {}, 'ID do Negócio (Deal ID)'), campoDeal),
          btnMapear,
          btnGerar),
        areaPrevia)),

    h('div', { class: 'cartao', style: 'margin-top:16px' },
      h('div', { class: 'cartao-cabeca' }, h('h3', {}, 'Rotina Mensal de Cobrança (NXFacil)')),
      h('div', { class: 'cartao-corpo' },
        h('p', { class: 'silencioso', style: 'margin:0 0 12px;font-size:12.5px' },
          'Roda sob demanda a rotina mensal: busca os negócios "Ganhos" no Bitrix24 e gera boleto + NF na NXFacil.'),
        btnCobranca)));
}

// -------------------------------- 3. Simulador D4Sign --------------------------------
function montarSimulador() {
  const inpRazao = h('input', { type: 'text', value: 'Atlas Soluções & Tecnologia Ltda' });
  const inpCnpj = h('input', { type: 'text', value: '12.345.678/0001-90' });
  const inpEmail = h('input', { type: 'email', value: 'diretoria@atlassolucoes.com.br' });
  const inpValor = h('input', { type: 'number', value: '1850.00', step: '0.01' });
  const inpDia = h('input', { type: 'text', value: '10' });
  const inpPlano = h('input', { type: 'text', value: 'Atlas GR Monitoramento & Gestão 360' });

  const areaResultado = h('div', { style: 'margin-top: 16px;' });

  const btnSimular = h('button', {
    class: 'botao', type: 'button',
    style: 'display: inline-flex; align-items: center; gap: 8px;',
    onclick: async () => {
      btnSimular.disabled = true;
      btnSimular.textContent = 'Simulando com D4Sign API...';
      limpar(areaResultado).append(carregando('Executando simulação de contrato D4Sign...'));

      try {
        const res = await api.post('/api/contratos/simular-geracao', {
          razaoSocial: inpRazao.value,
          cnpj: inpCnpj.value,
          emailSignatario: inpEmail.value,
          valor: Number(inpValor.value),
          vencimentoDia: inpDia.value,
          plano: inpPlano.value,
        });

        limpar(areaResultado);

        const listaPassos = h('div', { style: 'margin-top: 12px;' });
        for (const p of res.passos) {
          listaPassos.append(h('div', {
            class: 'cartao',
            style: 'margin-bottom: 8px; padding: 12px; border-left: 4px solid var(--ok, #10b981);',
          },
            h('div', { class: 'forte', style: 'color: var(--ok, #10b981);' }, `Passo ${p.passo}: ${p.descricao}`),
            h('div', { class: 'texto-suave', style: 'font-size: 12px;' }, p.detalhe)));
        }

        areaResultado.append(
          h('div', { class: 'cartao', style: 'border: 2px solid var(--ok, #10b981);' },
            h('div', { class: 'cartao-cabeca' },
              h('h3', {}, `✅ Contrato Simulado com Sucesso (UUID: ${res.documentoUuid})`),
              etiqueta('Status: Enviado', 'ok')),
            h('div', { class: 'cartao-corpo' },
              h('div', { class: 'indicadores', style: 'margin-bottom: 12px;' },
                indicador({ rotulo: 'Razão Social', valor: res.razaoSocial }),
                indicador({ rotulo: 'Signatário', valor: res.emailSignatario }),
                indicador({ rotulo: 'Valor Mensal', valor: res.valorFormatado, tom: 'ok' }),
                indicador({ rotulo: 'Dia Vencimento', valor: `Dia ${res.vencimentoDia}` })),
              h('div', { class: 'campo', style: 'margin-top: 12px;' },
                h('span', {}, 'Link de Assinatura Simulado'),
                h('div', { class: 'entre', style: 'gap: 8px;' },
                  h('code', { class: 'mono' }, res.linkAssinatura),
                  h('a', { class: 'botao pequeno', href: res.linkAssinatura, target: '_blank', rel: 'noopener' }, 'Abrir no D4Sign'))),
              listaPassos)),
        );

        modalPopupSucesso(
          'Simulação D4Sign Concluída!',
          `O contrato para "${res.razaoSocial}" foi gerado com sucesso no simulador D4Sign.`,
          h('div', { class: 'aviso ok' }, `Documento UUID: ${res.documentoUuid}`)
        );
      } catch (e) {
        limpar(areaResultado).append(h('div', { class: 'aviso critico' }, e.message));
        toast(e.message, 'erro');
      } finally {
        btnSimular.disabled = false;
        btnSimular.replaceChildren(icone('enviar'), ' 🚀 Executar Simulação D4Sign');
      }
    },
  }, icone('enviar'), ' 🚀 Executar Simulação D4Sign');

  return h('div', { class: 'cartao' },
    h('div', { class: 'cartao-cabeca' }, h('h3', {}, '🎮 Simulador em Tempo Real — Geração de Contrato D4Sign')),
    h('div', { class: 'cartao-corpo' },
      h('p', { class: 'texto-suave', style: 'margin-bottom: 16px;' },
        'Testador de geração de contrato e envio de assinatura D4Sign. Simula o ciclo completo de mapeamento de variáveis, geração do documento safe e cadastro do signatário.'),
      h('div', { class: 'grade duas', style: 'gap: 12px;' },
        h('div', {},
          campo('Razão Social do Cliente', inpRazao),
          campo('CNPJ / CPF', inpCnpj),
          campo('Plano / Solução', inpPlano)),
        h('div', {},
          campo('E-mail do Signatário', inpEmail),
          campo('Valor Mensal (R$)', inpValor),
          campo('Dia de Vencimento', inpDia))),
      h('div', { style: 'margin-top: 16px;' }, btnSimular),
      areaResultado));
}

// -------------------------------- 4. Configuração --------------------------------
async function montarConfig() {
  const base = window.location.origin;

  const linhaUrl = (rotulo, url) => h('div', { class: 'campo' },
    h('span', {}, rotulo),
    h('div', { class: 'entre', style: 'gap:8px' },
      h('code', { class: 'mono', style: 'font-size:11.5px;word-break:break-all' }, url),
      h('button', {
        class: 'botao secundario pequeno', type: 'button',
        onclick: () => { navigator.clipboard.writeText(url); toast('Copiado.', 'ok'); },
      }, 'Copiar')));

  return h('div', { class: 'cartao' },
    h('div', { class: 'cartao-cabeca' }, h('h3', {}, 'Webhooks para Automação Bitrix24 & D4Sign')),
    h('div', { class: 'cartao-corpo' },
      linhaUrl('Bitrix24 → Gerar contrato (Regra de Automação)', `${base}/webhooks/bitrix/gerar-contrato?dealId={{ID}}&secret=SEU_SEGREDO`),
      linhaUrl('D4Sign → Assinatura/Cancelamento (Webhook automático)', `${base}/webhooks/d4sign`),
      h('p', { class: 'dica', style: 'margin-top:10px' },
        'Configure o webhook no Bitrix24 para disparo 100% automático na mudança de fase.')));
}

// --------------------------------- Casca --------------------------------
export async function montar(ctx) {
  ctx.definirCabecalho({
    titulo: 'Contratos & Gestão de Carteira',
    subtitulo: 'Bitrix24 × D4Sign × NXFacil · Integração e Geração Automática de Contratos',
  });

  let abaAtual = 'geral';
  const area = h('div', {}, carregando());

  const renderizarBotoes = () => h('div', { class: 'row', style: 'margin-bottom:16px; gap:8px;' },
    ...ABAS.map((aba) => h('button', {
      class: `botao ${aba.id === abaAtual ? '' : 'secundario'} pequeno`,
      type: 'button',
      onclick: () => trocarAba(aba.id),
    }, aba.rotulo)));

  async function trocarAba(novaAba) {
    abaAtual = novaAba;
    limpar(area).append(carregando());
    cabecaBotoes.replaceWith(cabecaBotoes = renderizarBotoes());

    let conteudo;
    if (abaAtual === 'geral') conteudo = await montarGeral(ctx);
    else if (abaAtual === 'carteira') conteudo = await montarCarteira();
    else if (abaAtual === 'acoes') conteudo = montarAcoes(ctx);
    else if (abaAtual === 'simulador') conteudo = montarSimulador();
    else if (abaAtual === 'config') conteudo = await montarConfig();

    limpar(area).append(conteudo);
  }

  let cabecaBotoes = renderizarBotoes();
  const raiz = h('div', {}, cabecaBotoes, area);
  trocarAba('geral');

  return raiz;
}
