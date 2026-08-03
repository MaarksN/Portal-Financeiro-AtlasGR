const test = require('node:test');
const assert = require('node:assert');
const pdv = require('../lib/pdv');
const fiscal = require('../lib/fiscal');
const { executar, consultarUm, banco } = require('../db');

test('Testes do Módulo PDV e Fiscal', async (t) => {
  // Configuração inicial limpa para os testes
  executar('DELETE FROM notas_fiscais');
  executar('DELETE FROM pagamentos_venda_pdv');
  executar('DELETE FROM itens_venda_pdv');
  executar('DELETE FROM vendas_pdv');
  executar('DELETE FROM movimentacoes_caixa');
  executar('DELETE FROM sessoes_caixa');
  executar('DELETE FROM caixas');

  executar("INSERT INTO caixas (id, nome, filial, ativo) VALUES (999, 'Caixa Teste', 'Matriz', 1)");

  const operador = 'caixa_teste@atlasgr.com.br';
  let sessaoId;

  await t.test('Deve abrir o caixa com sucesso', () => {
    const sessao = pdv.abrirCaixa(999, operador, 10000); // R$ 100,00
    assert.strictEqual(sessao.status, 'aberto');
    assert.strictEqual(sessao.saldo_inicial, 10000);
    sessaoId = sessao.id;
  });

  await t.test('Não deve permitir abrir caixa se já houver um aberto para o operador', () => {
    assert.throws(
      () => pdv.abrirCaixa(999, operador, 5000),
      { codigo: 'caixa_ja_aberto' }
    );
  });

  await t.test('Não deve permitir registrar venda se o valor pago for menor', () => {
    const dadosVenda = {
      itens: [{ produtoNome: 'Teste', quantidade: 1, precoUnitarioCentavos: 5000, subtotalCentavos: 5000 }],
      pagamentos: [{ formaPagamento: 'dinheiro', valorCentavos: 4000 }]
    };

    assert.throws(
      () => pdv.registrarVenda(sessaoId, operador, dadosVenda),
      /O valor pago é insuficiente/
    );
  });

  let vendaId;
  await t.test('Deve registrar uma venda com sucesso', () => {
    const dadosVenda = {
      itens: [
        { produtoNome: 'Produto A', quantidade: 1, precoUnitarioCentavos: 2500, subtotalCentavos: 2500 },
        { produtoNome: 'Produto B', quantidade: 2, precoUnitarioCentavos: 1000, subtotalCentavos: 2000 }
      ],
      pagamentos: [{ formaPagamento: 'dinheiro', valorCentavos: 5000 }] // Total: 4500, Troco: 500
    };

    const venda = pdv.registrarVenda(sessaoId, operador, dadosVenda);
    assert.strictEqual(venda.total_centavos, 4500);
    assert.strictEqual(venda.troco_centavos, 500);
    vendaId = venda.id;
  });

  await t.test('Simular emissão de NFC-e', async () => {
    const nota = await fiscal.emitirNFCe(vendaId);
    assert.strictEqual(nota.status, 'autorizada');
    assert.ok(nota.chave_acesso.length > 0);
  });

  await t.test('Deve calcular o saldo esperado corretamente', () => {
    const saldo = pdv.calcularSaldoEsperado(sessaoId);
    // Saldo inicial (10000) + Venda Dinheiro (5000) - Troco (500) = 14500
    assert.strictEqual(saldo, 14500);
  });

  await t.test('Deve fechar o caixa com sucesso', () => {
    const sessaoFechada = pdv.fecharCaixa(sessaoId, operador, 14500);
    assert.strictEqual(sessaoFechada.status, 'fechado');
    assert.strictEqual(sessaoFechada.saldo_esperado, 14500);
    assert.strictEqual(sessaoFechada.saldo_informado, 14500);
  });
});
