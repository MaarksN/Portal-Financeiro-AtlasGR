import { sessao } from '../nucleo/api.js';
import { h, icone } from '../nucleo/ui.js';

// ------------------------------------------------------------------
// Contratos & Cobrança — módulo à parte (Bitrix24 -> D4Sign -> Bitrix24
// + rotina mensal com NXFacil), com login e banco próprios. Aqui só
// explicamos o que ele faz e linkamos pra lá — nenhum dado atravessa
// a fronteira entre os dois serviços por aqui.
// ------------------------------------------------------------------

const PASSOS = [
  { titulo: 'Negócio marcado como "Ganho" no Bitrix24', texto: 'O funil já é o mesmo que o portal lê hoje.' },
  { titulo: 'Contrato gerado e enviado pra assinatura', texto: 'Documento criado no D4Sign a partir do template, e enviado ao cliente.' },
  { titulo: 'Assinatura sincronizada de volta', texto: 'Assinado ou cancelado, o Bitrix24 é atualizado automaticamente.' },
  { titulo: 'Cobrança mensal via NXFacil', texto: 'Boleto e nota fiscal dos negócios fechados, no dia 1 de cada mês.' },
];

export async function montar(ctx) {
  const url = sessao()?.integracoes?.contratosUrl;

  ctx.definirCabecalho({
    titulo: 'Contratos & Cobrança',
    subtitulo: 'Bitrix24 × D4Sign × NXFacil',
  });

  const raiz = h('div', {});

  if (!url) {
    raiz.append(h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' },
      h('div', { class: 'aviso alerta' }, icone('alerta', 16),
        h('div', {}, h('b', {}, 'Módulo não configurado. '),
          'Defina CONTRATOS_URL no .env do portal para linkar o serviço de contratos.')))));
    return raiz;
  }

  raiz.append(
    h('div', { class: 'cartao' },
      h('div', { class: 'cartao-cabeca' }, h('h3', {}, 'O que este módulo faz')),
      h('div', { class: 'cartao-corpo' },
        h('p', { style: 'margin:0 0 16px;font-size:13.5px;color:var(--texto2);line-height:1.6' },
          'Fecha o ciclo entre o negócio ganho no Bitrix24 e o dinheiro em caixa: gera o contrato, ',
          'acompanha a assinatura e dispara a cobrança mensal — sem planilha e sem passo manual.'),
        h('div', { class: 'timeline' }, ...PASSOS.map((p, i) => h('li', { class: i === 0 ? 'atual' : '' },
          h('div', { class: 'titulo' }, p.titulo),
          h('div', { class: 'texto' }, p.texto)))),
      )),
    h('div', { class: 'cartao' },
      h('div', { class: 'cartao-corpo', style: 'display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap' },
        h('div', {},
          h('div', { style: 'font-weight:700;font-size:14px' }, 'Abrir o módulo de contratos'),
          h('div', { class: 'silencioso', style: 'font-size:12px;margin-top:3px' },
            'Login separado do portal — peça acesso ao time de TI se ainda não tiver uma conta.')),
        h('a', {
          class: 'botao', href: url, target: '_blank', rel: 'noopener noreferrer',
        }, icone('externo', 15), 'Abrir Contratos & Cobrança'))),
  );

  return raiz;
}
