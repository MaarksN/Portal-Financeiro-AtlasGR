import { api } from '../nucleo/api.js';
import {
  h, limpar, icone, toast, modal, campo, lerFormulario, selecao,
  vazio, carregando, etiqueta, moeda,
} from '../nucleo/ui.js';

// ------------------------------------------------------------------
// Outras contas — poupança, carteira, caixa e aplicações.
// ------------------------------------------------------------------

export async function montar(ctx) {
  ctx.definirCabecalho({
    titulo: 'Outras contas',
    subtitulo: 'Poupança, carteira, caixa e aplicações',
    acoes: [
      h('button', {
        class: 'botao', type: 'button',
        onclick: () => novaConta(),
      }, icone('mais', 14), 'Nova conta'),
    ],
  });

  const area = h('div', {}, carregando());

  function novaConta() {
    const form = h('form', {},
      campo('Nome', h('input', { type: 'text', name: 'nome', required: true })),
      campo('Tipo', selecao('tipo', [
        { valor: 'poupanca', rotulo: 'Poupança' },
        { valor: 'carteira', rotulo: 'Carteira' },
        { valor: 'caixa', rotulo: 'Caixa' },
        { valor: 'aplicacao', rotulo: 'Aplicação' },
      ])),
      campo('Instituição', h('input', { type: 'text', name: 'instituicao' })));

    modal({
      titulo: 'Nova conta',
      corpo: form,
      acoes: [{
        rotulo: 'Cadastrar', estilo: 'sucesso',
        aoClicar: async (fechar) => {
          try {
            const dados = lerFormulario(form);
            await api.post('/api/financeiro/contas', { ...dados, saldo_inicial_centavos: 0 });
            fechar();
            toast('Conta cadastrada.', 'ok');
            carregar();
          } catch (erro) {
            toast(erro.message, 'erro');
          }
        },
      }],
    });
  }

  async function carregar() {
    limpar(area).append(carregando());
    try {
      const contas = await api.get('/api/financeiro/outras-contas');
      limpar(area);

      if (!contas.length) {
        area.append(h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' },
          vazio('Nenhuma conta secundária', 'Cadastre contas de poupança, carteira, caixa ou aplicação.'))));
        return;
      }

      const NOMES_TIPO = { poupanca: 'Poupança', carteira: 'Carteira', caixa: 'Caixa', aplicacao: 'Aplicação' };

      area.append(h('div', { class: 'grade duas' },
        ...contas.map((c) => h('div', { class: 'cartao' },
          h('div', { class: 'cartao-cabeca' },
            h('h3', {}, c.nome),
            h('div', { class: 'acoes' }, etiqueta(NOMES_TIPO[c.tipo] || c.tipo, 'info'))),
          h('div', { class: 'cartao-corpo' },
            h('div', { class: 'entre' },
              h('span', { class: 'silencioso' }, 'Instituição'),
              h('span', {}, c.instituicao || '—')),
            h('div', { class: 'entre', style: 'margin-top:8px' },
              h('span', { class: 'silencioso' }, 'Saldo inicial'),
              h('span', { class: 'forte' }, moeda(c.saldo_inicial_centavos))))))));
    } catch (erro) {
      limpar(area).append(h('div', { class: 'aviso critico' }, icone('alerta', 16), h('div', {}, erro.message)));
    }
  }

  await carregar();
  return area;
}
