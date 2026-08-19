import { api } from '../nucleo/api.js';
import {
  h, limpar, icone, toast, moeda, moedaCurta, dataHora,
  carregando, etiqueta, indicador, aviso, vazio,
} from '../nucleo/ui.js';

// ------------------------------------------------------------------
// Contratos & Cobrança: Bitrix24 (deal "Ganho") -> D4Sign (contrato +
// assinatura) -> Bitrix24 (funil) + rotina mensal de boleto/nota via
// NXFacil. Módulo nativo do portal — mesma sessão e RBAC de tudo mais.
// ------------------------------------------------------------------

const ABAS = [
  { id: 'geral', rotulo: 'Visão geral' },
  { id: 'carteira', rotulo: 'Carteira' },
  { id: 'acoes', rotulo: 'Ações' },
  { id: 'config', rotulo: 'Configuração' },
];

const BADGE_CONTRATO = { signed: 'ok', sent: 'alerta', cancelled: 'critico' };

function badgeCobranca(cobranca) {
  if (!cobranca) return etiqueta('sem cobrança', 'neutro');
  const erro = cobranca.boletoStatus === 'error' || cobranca.notaStatus === 'error';
  return etiqueta(`${cobranca.mesReferencia}: boleto ${cobranca.boletoStatus} / nota ${cobranca.notaStatus}`, erro ? 'critico' : 'ok');
}

// -------------------------------- Geral --------------------------------
async function montarGeral(ctx) {
  const [kpis, alertas] = await Promise.all([api.get('/api/contratos/kpis'), api.get('/api/contratos/alertas')]);
  const cobr = kpis.cobrancaMes;

  const listaAlertas = alertas.length
    ? h('div', { class: 'pilha' }, ...alertas.map((a) => aviso(
      a.severidade === 'critico' ? 'critico' : a.severidade === 'atencao' ? 'alerta' : 'info',
      h('div', {}, h('b', {}, a.titulo), h('div', { class: 'silencioso', style: 'margin-top:2px' }, a.subtitulo)),
    )))
    : aviso('ok', h('div', {}, h('b', {}, 'Nada pendente. '), 'Nenhum alerta no momento.'));

  return h('div', {},
    h('div', { class: 'indicadores' },
      indicador({ rotulo: 'Total em carteira', valor: moedaCurta(kpis.totalCarteiraCentavos) }),
      indicador({ rotulo: 'Negócios acompanhados', valor: kpis.totalDeals }),
      indicador({ rotulo: 'Contratos assinados', valor: kpis.contratos.signed, tom: 'ok' }),
      indicador({ rotulo: 'Aguardando assinatura', valor: kpis.contratos.sent, tom: kpis.contratos.sent ? 'alerta' : '' }),
      indicador({ rotulo: 'Taxa de assinatura', valor: `${kpis.taxaAssinatura.toFixed(0)}%` }),
      indicador({
        rotulo: `Cobranças processadas (${cobr.mesReferencia})`, valor: `${cobr.ok + cobr.mock}/${cobr.total}`,
        tom: cobr.error ? 'critico' : 'ok', nota: cobr.error ? `${cobr.error} com erro` : undefined,
      })),
    h('div', { class: 'cartao', style: 'margin-top:16px' },
      h('div', { class: 'cartao-cabeca' }, h('h3', {}, 'Alertas')),
      h('div', { class: 'cartao-corpo' }, listaAlertas)));
}

// ------------------------------- Carteira -------------------------------
async function montarCarteira() {
  const carteira = await api.get('/api/contratos/carteira');
  if (!carteira.length) {
    return h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' },
      vazio('Nenhum negócio na carteira ainda', 'Gere um contrato pela aba Ações, ou aguarde a rotina mensal — os negócios aparecem aqui automaticamente.')));
  }

  const corpo = h('tbody', {});
  for (const d of carteira) {
    corpo.append(h('tr', {},
      h('td', {}, h('div', { class: 'forte' }, d.clienteNome || d.titulo || `Deal ${d.dealId}`),
        h('div', { class: 'silencioso', style: 'font-size:11px' }, `Deal ${d.dealId}`)),
      h('td', { class: 'num' }, d.valorCentavos != null ? moeda(d.valorCentavos) : '—'),
      h('td', {}, etiqueta(d.contratoStatusRotulo, BADGE_CONTRATO[d.contratoStatus] || 'neutro')),
      h('td', {}, badgeCobranca(d.ultimaCobranca)),
      h('td', {}, dataHora(d.atualizadoEm))));
  }

  return h('div', { class: 'cartao' },
    h('div', { class: 'cartao-cabeca' }, h('h3', {}, 'Carteira de contratos e cobranças')),
    h('div', { class: 'cartao-corpo sem-espaco' }, h('div', { class: 'tabela-envolve' }, h('table', {},
      h('thead', {}, h('tr', {},
        h('th', {}, 'Cliente / Negócio'), h('th', { class: 'num' }, 'Valor'),
        h('th', {}, 'Contrato'), h('th', {}, 'Última cobrança'), h('th', {}, 'Atualizado em'))),
      corpo))));
}

// -------------------------------- Ações --------------------------------
function montarAcoes(ctx) {
  const campoDeal = h('input', { type: 'text', placeholder: 'ex.: 128' });
  const btnGerar = h('button', { class: 'botao', type: 'button' }, 'Gerar e enviar contrato');
  const btnCobranca = h('button', { class: 'botao', type: 'button' }, 'Executar cobrança mensal agora');

  btnGerar.addEventListener('click', async () => {
    const dealId = campoDeal.value.trim();
    if (!dealId) return toast('Informe o ID do negócio.', 'erro');
    btnGerar.disabled = true;
    btnGerar.textContent = 'Gerando...';
    try {
      const resultado = await api.post('/api/contratos/gerar-contrato', { dealId });
      toast(`Contrato ${resultado.documentoUuid} enviado para assinatura.`, 'ok');
      ctx.recarregar();
    } catch (erro) {
      toast(erro.message, 'erro');
    } finally {
      btnGerar.disabled = false;
      btnGerar.textContent = 'Gerar e enviar contrato';
    }
  });

  btnCobranca.addEventListener('click', async () => {
    btnCobranca.disabled = true;
    btnCobranca.textContent = 'Executando...';
    try {
      const resumo = await api.post('/api/contratos/rodar-cobranca');
      toast(`${resumo.total} negócio(s) processado(s) em ${resumo.mesReferencia}.`, 'ok');
      ctx.recarregar();
    } catch (erro) {
      toast(erro.message, 'erro');
    } finally {
      btnCobranca.disabled = false;
      btnCobranca.textContent = 'Executar cobrança mensal agora';
    }
  });

  return h('div', {},
    h('div', { class: 'cartao' },
      h('div', { class: 'cartao-cabeca' }, h('h3', {}, 'Gerar e enviar contrato')),
      h('div', { class: 'cartao-corpo' },
        h('p', { class: 'silencioso', style: 'margin:0 0 12px;font-size:12.5px' },
          'Dispara manualmente o mesmo fluxo que a Regra de Automação do Bitrix24 chamaria: busca o negócio, cria o documento no D4Sign, cadastra o signatário e envia para assinatura.'),
        h('div', { class: 'linha-campos' },
          h('label', { class: 'campo' }, h('span', {}, 'ID do negócio (Deal ID) no Bitrix24'), campoDeal)),
        btnGerar)),
    h('div', { class: 'cartao', style: 'margin-top:16px' },
      h('div', { class: 'cartao-cabeca' }, h('h3', {}, 'Rotina mensal de cobrança (NXFacil)')),
      h('div', { class: 'cartao-corpo' },
        h('p', { class: 'silencioso', style: 'margin:0 0 12px;font-size:12.5px' },
          'Roda sob demanda a mesma rotina do dia 1: busca os negócios "Ganhos" no Bitrix24 e pede à NXFacil boleto + nota fiscal de cada um.'),
        btnCobranca)));
}

// ----------------------------- Configuração -----------------------------
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
    h('div', { class: 'cartao-cabeca' }, h('h3', {}, 'Webhooks para configurar')),
    h('div', { class: 'cartao-corpo' },
      linhaUrl('Bitrix24 → gerar contrato (Regra de Automação)', `${base}/webhooks/bitrix/gerar-contrato?dealId={{ID}}&secret=SEU_SEGREDO`),
      linhaUrl('D4Sign → assinatura/cancelamento (registrar no documento/cofre)', `${base}/webhooks/d4sign`),
      h('p', { class: 'dica', style: 'margin-top:10px' },
        'A URL do Bitrix24 precisa do valor de CONTRATOS_WEBHOOK_SECRET (variável de ambiente do servidor) no lugar de SEU_SEGREDO.')));
}

// --------------------------------- Casca --------------------------------
export async function montar(ctx) {
  ctx.definirCabecalho({ titulo: 'Contratos & Cobrança', subtitulo: 'Bitrix24 × D4Sign × NXFacil' });

  let abaAtual = 'geral';
  const area = h('div', {}, carregando());

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
      const conteudo = abaAtual === 'geral' ? await montarGeral(ctx)
        : abaAtual === 'carteira' ? await montarCarteira()
          : abaAtual === 'acoes' ? montarAcoes({ ...ctx, recarregar: renderizarConteudo })
            : await montarConfig();
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
