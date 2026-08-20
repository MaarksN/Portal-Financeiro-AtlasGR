// Peças de interface compartilhadas: formatação, construção de DOM,
// ícones, toast e modal. Nada de framework — o portal é pequeno o
// bastante para não pagar esse preço, e assim não há passo de build.

// O código de renderização é cheio de `condicao ? no : null` dentro de
// `.append(...)`, para pular um filho condicionalmente — é o mesmo
// padrão que o h() já filtra. Mas Element.append() nativo não filtra:
// ele transforma null/undefined em texto literal "null"/"undefined" na
// tela. Corrigido uma vez aqui em vez de em cada um dos ~70 call sites.
if (typeof Element !== 'undefined' && Element.prototype?.append) {
  const appendNativo = Element.prototype.append;
  Element.prototype.append = function anexarFiltrando(...filhos) {
    return appendNativo.apply(this, filhos.filter((f) => f !== null && f !== undefined && f !== false));
  };
}

// ---------------------------- Formatação ----------------------------
export const esc = (valor) => String(valor ?? '').replace(
  /[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
);

const formatadorMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const formatadorCompacto = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1,
});

export const moeda = (centavos) => formatadorMoeda.format(Number(centavos || 0) / 100);
export const moedaCurta = (centavos) => formatadorCompacto.format(Number(centavos || 0) / 100);

export function data(iso) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}

export function dataHora(iso) {
  if (!iso) return '—';
  // O SQLite grava "YYYY-MM-DD HH:MM:SS" em UTC, sem o marcador de fuso.
  const normalizado = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(iso) ? `${iso.replace(' ', 'T')}Z` : iso;
  const d = new Date(normalizado);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function desdeQuando(iso) {
  if (!iso) return '—';
  const normalizado = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(iso) ? `${iso.replace(' ', 'T')}Z` : iso;
  const minutos = Math.round((Date.now() - new Date(normalizado).getTime()) / 60000);
  if (Number.isNaN(minutos)) return '—';
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.round(horas / 24);
  return dias < 30 ? `há ${dias}d` : data(iso);
}

export const hoje = () => new Date().toISOString().slice(0, 10);

export const emDias = (dias) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};

export const iniciais = (nome) => String(nome || '?')
  .split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase();

// ---------------------------- DOM ----------------------------
// h('div', {class:'x', onclick:fn}, 'texto', outroNo)
export function h(tag, props = {}, ...filhos) {
  const no = document.createElement(tag);
  for (const [chave, valor] of Object.entries(props || {})) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (chave === 'class') no.className = valor;
    else if (chave === 'html') no.innerHTML = valor;
    else if (chave === 'dataset') Object.assign(no.dataset, valor);
    else if (chave.startsWith('on') && typeof valor === 'function') {
      no.addEventListener(chave.slice(2).toLowerCase(), valor);
    } else no.setAttribute(chave, valor === true ? '' : valor);
  }
  for (const filho of filhos.flat(Infinity)) {
    if (filho === null || filho === undefined || filho === false) continue;
    no.append(filho instanceof Node ? filho : document.createTextNode(String(filho)));
  }
  return no;
}

export const limpar = (no) => { no.replaceChildren(); return no; };

export const doHtml = (texto) => {
  const molde = document.createElement('template');
  molde.innerHTML = texto.trim();
  return molde.content.firstElementChild;
};

// ---------------------------- Ícones ----------------------------
const CAMINHOS = {
  inicio: 'M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5',
  reembolso: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  cobranca: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  aprovacao: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  fonte: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z',
  mais: 'M12 5v14M5 12h14',
  atualizar: 'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15',
  baixar: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  enviar: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  alerta: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  relogio: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  volta: 'M19 12H5M12 19l-7-7 7-7',
  filtro: 'M22 3H2l8 9.5V19l4 2v-8.5z',
  busca: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  usuario: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  assistente: 'M12 2 14 9 21 12 14 15 12 22 10 15 3 12 10 9Z',
  anexo: 'M21.4 11.05 12.25 20.2a6 6 0 0 1-8.49-8.49l9.2-9.19a4 4 0 0 1 5.65 5.66L9.4 17.4a2 2 0 0 1-2.83-2.83l8.49-8.48',
  lixeira: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
  externo: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
  telefone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
  whatsapp: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8.5 8c-.3 0-.7.1-.9.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.4 1.6.5.7.2 1.3.2 1.8.1.5-.1 1.7-.7 1.9-1.4.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.6-.4-.3-.1-1.7-.9-2-1-.3-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.1-.3.2-.5.1-.3-.1-1.1-.4-2-1.2-.8-.7-1.3-1.5-1.4-1.8-.1-.2 0-.4.1-.5l.4-.5c.1-.2.2-.3.2-.5.1-.2 0-.3 0-.5-.1-.1-.6-1.5-.8-2-.2-.5-.4-.4-.6-.4z',
};

export function icone(nome, tamanho) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (tamanho) {
    svg.style.width = `${tamanho}px`;
    svg.style.height = `${tamanho}px`;
  }
  const caminho = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  caminho.setAttribute('d', CAMINHOS[nome] || CAMINHOS.inicio);
  svg.append(caminho);
  return svg;
}

// ---------------------------- Toast ----------------------------
function areaDeToasts() {
  let area = document.querySelector('.toasts');
  if (!area) {
    area = h('div', { class: 'toasts' });
    document.body.append(area);
  }
  return area;
}

export function toast(mensagem, tipo = '') {
  const no = h('div', { class: `toast ${tipo}` }, mensagem);
  areaDeToasts().append(no);
  setTimeout(() => {
    no.style.transition = 'opacity .25s';
    no.style.opacity = '0';
    setTimeout(() => no.remove(), 260);
  }, tipo === 'erro' ? 6000 : 3500);
}

// ---------------------------- Modal ----------------------------
// Devolve o elemento do modal e um `fechar()`. As ações recebem o
// próprio fechar, para o chamador decidir quando sair.
export function modal({ titulo, corpo, acoes = [], largo = false, aoFechar }) {
  const fundo = h('div', { class: 'modal-fundo' });

  const fechar = () => {
    fundo.remove();
    document.removeEventListener('keydown', comEsc);
    if (aoFechar) aoFechar();
  };
  const comEsc = (evento) => { if (evento.key === 'Escape') fechar(); };
  document.addEventListener('keydown', comEsc);

  const janela = h('div', { class: `modal ${largo ? 'largo' : ''}` },
    h('div', { class: 'modal-cabeca' },
      h('h3', {}, titulo),
      h('button', { class: 'fechar', type: 'button', onclick: fechar, 'aria-label': 'Fechar' }, '×')),
    h('div', { class: 'modal-corpo' }, corpo),
    acoes.length
      ? h('div', { class: 'modal-rodape' }, ...acoes.map((acao) => h('button', {
        class: `botao ${acao.estilo || 'secundario'}`,
        type: 'button',
        onclick: () => acao.aoClicar(fechar),
      }, acao.rotulo)))
      : null);

  fundo.append(janela);
  fundo.addEventListener('mousedown', (evento) => { if (evento.target === fundo) fechar(); });
  document.body.append(fundo);

  const primeiro = janela.querySelector('input, select, textarea');
  if (primeiro) primeiro.focus();

  return { elemento: janela, fechar };
}

export function confirmar({ titulo, texto, confirmar: rotulo = 'Confirmar', estilo = 'perigo' }) {
  return new Promise((resolve) => {
    modal({
      titulo,
      corpo: h('p', { style: 'margin:0;font-size:13.5px;color:var(--texto2);line-height:1.6' }, texto),
      acoes: [
        { rotulo: 'Cancelar', aoClicar: (fechar) => { fechar(); resolve(false); } },
        { rotulo, estilo, aoClicar: (fechar) => { fechar(); resolve(true); } },
      ],
      aoFechar: () => resolve(false),
    });
  });
}

// ---------------------------- Blocos prontos ----------------------------
export const etiqueta = (texto, tom = '') => h('span', { class: `etiqueta ${tom}` }, texto);

export const vazio = (titulo, texto) => h('div', { class: 'vazio' },
  h('b', {}, titulo),
  texto ? h('span', {}, texto) : null);

export const carregando = (texto = 'Carregando…') => h('div', { class: 'carregando' }, texto);

export function aviso(tipo, conteudo) {
  return h('div', { class: `aviso ${tipo}` }, icone(tipo === 'info' ? 'relogio' : 'alerta', 16), h('div', {}, conteudo));
}

export function bannerAlerta({ titulo, subtitulo, tom = 'alerta', iconeNome = 'alerta', acaoRotulo, aoClicar }) {
  return h('div', { class: `banner-alerta-executivo ${tom}` },
    h('div', { class: 'icone-alerta' }, icone(iconeNome, 20)),
    h('div', { class: 'conteudo-alerta' },
      h('div', { class: 'titulo-alerta' }, titulo),
      subtitulo ? h('div', { class: 'subtitulo-alerta' }, subtitulo) : null),
    acaoRotulo ? h('div', { class: 'acoes-alerta' },
      h('button', {
        class: `botao ${tom === 'critico' ? 'perigo' : ''} pequeno`,
        type: 'button',
        onclick: aoClicar,
      }, acaoRotulo)) : null);
}

export function indicador({ rotulo, valor, nota, tom = '', iconeNome = null }) {
  return h('div', { class: `indicador ${tom}` },
    h('div', { class: 'rotulo' },
      rotulo,
      iconeNome ? icone(iconeNome, 15) : null),
    h('div', { class: 'valor' }, valor),
    nota ? h('div', { class: 'nota' }, nota) : null);
}

export function cardMes({ nomeMes, valorCentavos, quantidade, detalhe, aoClicar }) {
  return h('div', { class: 'card-mes', style: aoClicar ? 'cursor:pointer' : '', onclick: aoClicar },
    h('div', { class: 'cabeca-mes' },
      h('span', { class: 'nome-mes' }, nomeMes),
      quantidade !== undefined ? etiqueta(`${quantidade} contrato(s)`, 'neutro') : null),
    h('div', { class: 'valor-mes' }, moeda(valorCentavos)),
    detalhe ? h('div', { class: 'detalhes-mes' }, h('span', {}, detalhe)) : null);
}

export function cardDia({ dia, rotulo, valorCentavos, quantidade, hoje = false, aoClicar }) {
  return h('div', { class: `card-dia ${hoje ? 'hoje' : ''}`, style: aoClicar ? 'cursor:pointer' : '', onclick: aoClicar },
    h('div', { class: 'numero-dia' }, dia),
    h('div', { class: 'rotulo-dia' }, rotulo || 'Vencimento'),
    h('div', { class: 'valor-dia' }, valorCentavos ? moedaCurta(valorCentavos) : '—'),
    quantidade ? h('div', { class: 'contagem-dia' }, `${quantidade} item(ns)`) : null);
}

export function campo(rotulo, controle, dica) {
  return h('label', { class: 'campo' },
    h('span', {}, rotulo),
    controle,
    dica ? h('span', { class: 'dica' }, dica) : null);
}

export function selecao(nome, opcoes, valor) {
  const select = h('select', { name: nome });
  for (const opcao of opcoes) {
    const item = typeof opcao === 'string' ? { valor: opcao, rotulo: opcao } : opcao;
    const no = h('option', { value: item.valor }, item.rotulo);
    if (String(item.valor) === String(valor ?? '')) no.selected = true;
    select.append(no);
  }
  return select;
}

// Lê um formulário como objeto simples, trocando string vazia por null.
export function lerFormulario(elemento) {
  const dados = {};
  for (const [chave, valor] of new FormData(elemento).entries()) {
    const limpo = typeof valor === 'string' ? valor.trim() : valor;
    dados[chave] = limpo === '' ? null : limpo;
  }
  return dados;
}
