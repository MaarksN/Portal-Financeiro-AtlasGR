import { h, limpar, toast, icone, moeda } from '../nucleo/ui.js';
import { api } from '../nucleo/api.js';

let sessaoCaixa = null;
let itensVenda = [];

function calcularTotal() {
  return itensVenda.reduce((soma, i) => soma + i.subtotalCentavos, 0);
}

function renderizarTelaAbertura(ctx) {
  return h('div', { class: 'cartao pdv-abertura' },
    h('h2', {}, 'Abertura de Caixa'),
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          sessaoCaixa = await api.post('/api/pdv/abrir', { caixaId: 1, saldoInicialCentavos: 0 }); // Hardcoded caixaId for demo
          toast('Caixa aberto com sucesso.', 'sucesso');
          ctx.recarregar();
        } catch (err) {
          toast(err.message, 'erro');
        }
      }
    },
      h('button', { type: 'submit', class: 'botao primario' }, 'Abrir Caixa Agora')
    )
  );
}

function renderizarTelaVenda(ctx) {
  const containerItens = h('div', { class: 'pdv-itens' });
  const divTotal = h('div', { class: 'pdv-total' }, 'Total: R$ 0,00');

  const atualizarItens = () => {
    limpar(containerItens);
    itensVenda.forEach((item, idx) => {
      containerItens.append(
        h('div', { class: 'pdv-item' },
          h('span', {}, `${item.quantidade}x ${item.produtoNome}`),
          h('span', {}, moeda(item.subtotalCentavos)),
          h('button', { type: 'button', class: 'botao secundario', onclick: () => {
            itensVenda.splice(idx, 1);
            atualizarItens();
          }}, 'X')
        )
      );
    });
    divTotal.textContent = `Total: ${moeda(calcularTotal())}`;
  };

  const formProduto = h('form', {
    class: 'pdv-add-produto',
    onsubmit: (e) => {
      e.preventDefault();
      const nome = e.target.elements.produto.value.trim();
      const precoStr = e.target.elements.preco.value.trim();
      if (!nome || !precoStr) return;
      const precoCentavos = Math.round(parseFloat(precoStr.replace(',', '.')) * 100);

      itensVenda.push({
        produtoNome: nome,
        quantidade: 1,
        precoUnitarioCentavos: precoCentavos,
        subtotalCentavos: precoCentavos
      });

      e.target.reset();
      atualizarItens();
    }
  },
    h('input', { name: 'produto', placeholder: 'Nome do Produto', required: true }),
    h('input', { name: 'preco', type: 'number', step: '0.01', placeholder: 'Preço (R$)', required: true }),
    h('button', { type: 'submit', class: 'botao' }, 'Adicionar')
  );

  const formPagamento = h('form', {
    class: 'pdv-pagamento',
    onsubmit: async (e) => {
      e.preventDefault();
      if (itensVenda.length === 0) return toast('Adicione itens primeiro', 'erro');

      const forma = e.target.elements.forma.value;
      const total = calcularTotal();

      try {
        await api.post('/api/pdv/venda', {
          sessaoId: sessaoCaixa.id,
          itens: itensVenda,
          pagamentos: [{ formaPagamento: forma, valorCentavos: total }]
        });
        toast('Venda registrada e NF-e solicitada!', 'sucesso');
        itensVenda = [];
        atualizarItens();
      } catch (err) {
        toast(err.message, 'erro');
      }
    }
  },
    h('select', { name: 'forma' },
      h('option', { value: 'dinheiro' }, 'Dinheiro'),
      h('option', { value: 'pix' }, 'PIX'),
      h('option', { value: 'cartao' }, 'Cartão')
    ),
    h('button', { type: 'submit', class: 'botao primario' }, 'Finalizar Venda')
  );

  const botaoFechar = h('button', {
    type: 'button',
    class: 'botao perigo',
    onclick: async () => {
      if (confirm('Tem certeza que deseja fechar o caixa?')) {
        try {
          await api.post('/api/pdv/fechar', { sessaoId: sessaoCaixa.id, saldoInformadoCentavos: sessaoCaixa.saldoEsperado || 0 });
          toast('Caixa fechado.', 'sucesso');
          sessaoCaixa = null;
          ctx.recarregar();
        } catch (err) {
          toast(err.message, 'erro');
        }
      }
    }
  }, 'Fechar Caixa');

  atualizarItens();

  return h('div', { class: 'pdv-venda' },
    h('div', { class: 'pdv-cabecalho' },
      h('h2', {}, 'Frente de Caixa (PDV)'),
      botaoFechar
    ),
    formProduto,
    containerItens,
    divTotal,
    formPagamento
  );
}

export async function montar(ctx) {
  ctx.definirCabecalho({ titulo: 'Frente de Caixa' });

  try {
    const res = await api.get('/api/pdv/sessao');
    sessaoCaixa = res.sessao;
  } catch (err) {
    sessaoCaixa = null;
  }

  const principal = h('div', { class: 'pdv-container' });

  if (!sessaoCaixa) {
    principal.append(renderizarTelaAbertura(ctx));
  } else {
    principal.append(renderizarTelaVenda(ctx));
  }

  return principal;
}
