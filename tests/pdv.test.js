import { describe, it, expect, beforeEach } from 'vitest';
const pdv = require('../lib/pdv');
const fiscal = require('../lib/fiscal');
const { executar, consultarUm, banco } = require('../db');

describe('Testes do Módulo PDV e Fiscal', () => {
  let sessaoId;
  let vendaId;
  const operador = 'caixa_teste@atlasgr.com.br';

  beforeEach(() => {
    executar('DELETE FROM notas_fiscais');
    executar('DELETE FROM pagamentos_venda_pdv');
    executar('DELETE FROM itens_venda_pdv');
    executar('DELETE FROM vendas_pdv');
    executar('DELETE FROM movimentacoes_caixa');
    executar('DELETE FROM sessoes_caixa');
    executar('DELETE FROM caixas');

    executar("INSERT INTO caixas (id, nome, filial, ativo) VALUES (999, 'Caixa Teste', 'Matriz', 1)");
  });

  it('Deve abrir o caixa com sucesso', () => {
    const sessao = pdv.abrirCaixa(999, operador, 10000); // R$ 100,00
    expect(sessao.status).toBe('aberto');
    expect(sessao.saldo_inicial).toBe(10000);
    sessaoId = sessao.id;
  });

  it('Não deve permitir abrir caixa se já houver um aberto para o operador', () => {
    pdv.abrirCaixa(999, operador, 10000);
    expect(() => pdv.abrirCaixa(999, operador, 5000)).toThrow();
  });

  it('Não deve permitir registrar venda se o valor pago for menor', () => {
    const sessao = pdv.abrirCaixa(999, operador, 10000);
    const dadosVenda = {
      itens: [{ produtoNome: 'Teste', quantidade: 1, precoUnitarioCentavos: 5000, subtotalCentavos: 5000 }],
      pagamentos: [{ formaPagamento: 'dinheiro', valorCentavos: 4000 }]
    };

    expect(() => pdv.registrarVenda(sessao.id, operador, dadosVenda)).toThrow(/insuficiente/i);
  });

  it('Deve registrar uma venda e fechar caixa com sucesso', async () => {
    const sessao = pdv.abrirCaixa(999, operador, 10000);
    const dadosVenda = {
      itens: [
        { produtoNome: 'Produto A', quantidade: 1, precoUnitarioCentavos: 2500, subtotalCentavos: 2500 },
        { produtoNome: 'Produto B', quantidade: 2, precoUnitarioCentavos: 1000, subtotalCentavos: 2000 }
      ],
      pagamentos: [{ formaPagamento: 'dinheiro', valorCentavos: 5000 }] // Total: 4500, Troco: 500
    };

    const venda = pdv.registrarVenda(sessao.id, operador, dadosVenda);
    expect(venda.total_centavos).toBe(4500);
    expect(venda.troco_centavos).toBe(500);

    const nota = await fiscal.emitirNFCe(venda.id);
    expect(nota.status).toBe('autorizada');
    expect(nota.chave_acesso.length).toBeGreaterThan(0);

    const saldo = pdv.calcularSaldoEsperado(sessao.id);
    expect(saldo).toBe(14500);

    const sessaoFechada = pdv.fecharCaixa(sessao.id, operador, 14500);
    expect(sessaoFechada.status).toBe('fechado');
    expect(sessaoFechada.saldo_esperado).toBe(14500);
    expect(sessaoFechada.saldo_informado).toBe(14500);
  });
});
