const express = require('express');
const router = express.Router();
const currency = require('currency.js');

// Mock/Base de dados financeira padronizada
const dadosFinanceiros = {
  caixa: 3842150.00,
  contasReceber: 1250000.00,
  contasPagar: 412300.00,
  margemEbitda: 34.2,
  lancamentos: [
    {
      id: 1,
      data: "2026-08-08",
      descricao: "Recebimento Fatura #4892 - Frota Nacional",
      categoria: "Receita Operacional",
      valor: 185000.00,
      status: "Recebido"
    },
    {
      id: 2,
      data: "2026-08-07",
      descricao: "Pagamento Servidores AWS & Infraestrutura",
      categoria: "Despesa de TI",
      valor: -24800.00,
      status: "Pago"
    }
  ]
};

// Endpoint principal de resumo financeiro
router.get('/resumo', (req, res) => {
  const BRL = value => currency(value, { symbol: 'R$ ', separator: '.', decimal: ',' });
  
  res.json({
    status: 'success',
    timestamp: new Date().toISOString(),
    resumo: {
      caixaFormatado: BRL(dadosFinanceiros.caixa).format(),
      contasReceberFormatado: BRL(dadosFinanceiros.contasReceber).format(),
      contasPagarFormatado: BRL(dadosFinanceiros.contasPagar).format(),
      margemEbitda: `${dadosFinanceiros.margemEbitda}%`
    },
    lancamentos: dadosFinanceiros.lancamentos
  });
});

module.exports = router;
