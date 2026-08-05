import { api, sessao } from '../nucleo/api.js';
import { h, limpar, icone, toast, vazio } from '../nucleo/ui.js';

// ------------------------------------------------------------------
// Assistente de perguntas sobre os dados do portal. Não é um chat
// livre — cada pergunta vai com um retrato real e atual do que o
// usuário tem permissão de ver (ver lib/ia.js), então a resposta é
// sempre sobre o portal, nunca conhecimento geral.
// ------------------------------------------------------------------

function montarNaoConfigurado() {
  return h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' },
    h('div', { class: 'aviso alerta' }, icone('alerta', 16),
      h('div', {},
        h('b', {}, 'Assistente não configurado. '),
        'Preencha ANTHROPIC_API_KEY (e, se quiser, IA_MODELO) no .env para ativar — veja o .env.example.'))));
}

function bolha(texto, autor) {
  return h('div', { class: `ia-bolha ${autor}` },
    h('div', { class: 'ia-bolha-rotulo' }, autor === 'usuario' ? 'Você' : 'Assistente'),
    h('div', { class: 'ia-bolha-texto' }, texto));
}

function montarChat() {
  const raiz = h('div', { class: 'cartao' });
  const historico = h('div', { class: 'ia-historico' },
    vazio('Pergunte algo sobre o portal', 'Ex.: "quanto está em aberto na carteira de cobrança?" ou "quantos relatórios de reembolso eu tenho em aprovação?"'));

  const campoTexto = h('textarea', {
    rows: '2',
    placeholder: 'Escreva sua pergunta…',
    maxlength: '500',
  });
  const botaoEnviar = h('button', { class: 'botao primario', type: 'submit' }, 'Perguntar');

  let vazio_ = true;
  const enviar = async (evento) => {
    evento.preventDefault();
    const pergunta = campoTexto.value.trim();
    if (!pergunta) return;

    if (vazio_) { limpar(historico); vazio_ = false; }
    historico.append(bolha(pergunta, 'usuario'));
    campoTexto.value = '';
    botaoEnviar.disabled = true;
    botaoEnviar.textContent = 'Pensando…';
    const espera = bolha('…', 'assistente');
    historico.append(espera);
    historico.scrollTop = historico.scrollHeight;

    try {
      const { resposta } = await api.post('/api/ia/perguntar', { pergunta });
      espera.querySelector('.ia-bolha-texto').textContent = resposta;
    } catch (erro) {
      espera.remove();
      toast(erro.message, 'erro');
    } finally {
      botaoEnviar.disabled = false;
      botaoEnviar.textContent = 'Perguntar';
      historico.scrollTop = historico.scrollHeight;
    }
  };

  const form = h('form', { class: 'ia-form', onsubmit: enviar },
    campoTexto,
    botaoEnviar);

  campoTexto.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter' && !evento.shiftKey) enviar(evento);
  });

  raiz.append(historico, form);
  return raiz;
}

export async function montar(ctx) {
  ctx.definirCabecalho({
    titulo: 'Assistente',
    subtitulo: 'Pergunte sobre os dados que você já vê no portal',
  });

  return sessao()?.integracoes?.ia ? montarChat() : montarNaoConfigurado();
}
