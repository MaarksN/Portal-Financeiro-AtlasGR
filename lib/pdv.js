'use strict';

const { consultar, consultarUm, executar, emTransacao } = require('../db');
const { ErroApp } = require('./erros');
const auditoria = require('./auditoria');

// ------------------------------------------------------------------
// Caixas
// ------------------------------------------------------------------
function listarCaixas() {
  return consultar('SELECT * FROM caixas WHERE ativo = 1 ORDER BY nome');
}

// ------------------------------------------------------------------
// Sessões de Caixa
// ------------------------------------------------------------------
function buscarSessaoAberta(operadorEmail) {
  return consultarUm(
    "SELECT * FROM sessoes_caixa WHERE operador_email = ? AND status = 'aberto'",
    operadorEmail
  );
}

function abrirCaixa(caixaId, operadorEmail, saldoInicialCentavos) {
  const sessaoAtual = buscarSessaoAberta(operadorEmail);
  if (sessaoAtual) {
    throw new ErroApp('Você já possui um caixa aberto.', { status: 400, codigo: 'caixa_ja_aberto' });
  }

  const caixa = consultarUm('SELECT * FROM caixas WHERE id = ? AND ativo = 1', caixaId);
  if (!caixa) {
    throw new ErroApp('Caixa não encontrado ou inativo.', { status: 404, codigo: 'caixa_invalido' });
  }

  const resultado = executar(
    `INSERT INTO sessoes_caixa (caixa_id, operador_email, saldo_inicial, status)
     VALUES (?, ?, ?, 'aberto')`,
    caixaId,
    operadorEmail,
    saldoInicialCentavos || 0
  );

  const sessaoId = resultado.lastInsertRowid;
  auditoria.registrar({
    ator: operadorEmail,
    acao: 'pdv.caixa.aberto',
    entidade: 'sessao_caixa',
    entidadeId: sessaoId,
    detalhe: { caixaId, saldoInicialCentavos }
  });

  return consultarUm('SELECT * FROM sessoes_caixa WHERE id = ?', sessaoId);
}

function calcularSaldoEsperado(sessaoId) {
  const sessao = consultarUm('SELECT * FROM sessoes_caixa WHERE id = ?', sessaoId);
  if (!sessao) throw new ErroApp('Sessão não encontrada.', { status: 404 });

  // Dinheiro das vendas
  const { vendas_dinheiro } = consultarUm(
    `SELECT COALESCE(SUM(p.valor_centavos), 0) AS vendas_dinheiro
     FROM pagamentos_venda_pdv p
     JOIN vendas_pdv v ON v.id = p.venda_id
     WHERE v.sessao_id = ? AND v.status = 'concluida' AND p.forma_pagamento = 'dinheiro'`,
    sessaoId
  );

  // Troco dado nas vendas (reduz o dinheiro em caixa)
  const { total_troco } = consultarUm(
    `SELECT COALESCE(SUM(troco_centavos), 0) AS total_troco
     FROM vendas_pdv
     WHERE sessao_id = ? AND status = 'concluida'`,
    sessaoId
  );

  // Movimentações
  const movimentacoes = consultar(
    'SELECT tipo, valor_centavos FROM movimentacoes_caixa WHERE sessao_id = ?',
    sessaoId
  );

  let saldo = sessao.saldo_inicial + vendas_dinheiro - total_troco;

  for (const mov of movimentacoes) {
    if (mov.tipo === 'suprimento') saldo += mov.valor_centavos;
    if (mov.tipo === 'sangria') saldo -= mov.valor_centavos;
  }

  return saldo;
}

function fecharCaixa(sessaoId, operadorEmail, saldoInformadoCentavos) {
  const sessao = consultarUm('SELECT * FROM sessoes_caixa WHERE id = ?', sessaoId);
  if (!sessao) throw new ErroApp('Sessão não encontrada.', { status: 404 });
  if (sessao.operador_email !== operadorEmail) {
    throw new ErroApp('Esta sessão pertence a outro operador.', { status: 403 });
  }
  if (sessao.status !== 'aberto') {
    throw new ErroApp('O caixa já está fechado.', { status: 400 });
  }

  const saldoEsperado = calcularSaldoEsperado(sessaoId);

  executar(
    `UPDATE sessoes_caixa
     SET status = 'fechado', fechado_em = datetime('now'),
         saldo_esperado = ?, saldo_informado = ?, atualizado_em = datetime('now')
     WHERE id = ?`,
    saldoEsperado,
    saldoInformadoCentavos,
    sessaoId
  );

  auditoria.registrar({
    ator: operadorEmail,
    acao: 'pdv.caixa.fechado',
    entidade: 'sessao_caixa',
    entidadeId: sessaoId,
    detalhe: { saldoEsperado, saldoInformado: saldoInformadoCentavos }
  });

  return consultarUm('SELECT * FROM sessoes_caixa WHERE id = ?', sessaoId);
}

// ------------------------------------------------------------------
// Movimentações (Sangria e Suprimento)
// ------------------------------------------------------------------
function registrarMovimentacao(sessaoId, operadorEmail, tipo, valorCentavos, justificativa) {
  if (!['sangria', 'suprimento'].includes(tipo)) {
    throw new ErroApp('Tipo de movimentação inválido.', { status: 400 });
  }
  if (!valorCentavos || valorCentavos <= 0) {
    throw new ErroApp('Valor deve ser maior que zero.', { status: 400 });
  }

  const sessao = consultarUm('SELECT * FROM sessoes_caixa WHERE id = ?', sessaoId);
  if (!sessao || sessao.status !== 'aberto') {
    throw new ErroApp('Sessão de caixa inválida ou fechada.', { status: 400 });
  }
  if (sessao.operador_email !== operadorEmail) {
    throw new ErroApp('Esta sessão pertence a outro operador.', { status: 403 });
  }

  const resultado = executar(
    `INSERT INTO movimentacoes_caixa (sessao_id, tipo, valor_centavos, justificativa)
     VALUES (?, ?, ?, ?)`,
    sessaoId, tipo, valorCentavos, justificativa || null
  );

  auditoria.registrar({
    ator: operadorEmail,
    acao: `pdv.movimentacao.${tipo}`,
    entidade: 'sessao_caixa',
    entidadeId: sessaoId,
    detalhe: { valorCentavos, justificativa }
  });

  return consultarUm('SELECT * FROM movimentacoes_caixa WHERE id = ?', resultado.lastInsertRowid);
}

// ------------------------------------------------------------------
// Vendas
// ------------------------------------------------------------------
function registrarVenda(sessaoId, operadorEmail, dadosVenda) {
  const { clienteNome, clienteDoc, itens, pagamentos, descontosCentavos = 0 } = dadosVenda;

  if (!itens || itens.length === 0) {
    throw new ErroApp('A venda precisa ter itens.', { status: 400 });
  }
  if (!pagamentos || pagamentos.length === 0) {
    throw new ErroApp('A venda precisa ter pagamentos.', { status: 400 });
  }

  const sessao = consultarUm('SELECT * FROM sessoes_caixa WHERE id = ?', sessaoId);
  if (!sessao || sessao.status !== 'aberto') {
    throw new ErroApp('Caixa fechado ou inválido.', { status: 400 });
  }
  if (sessao.operador_email !== operadorEmail) {
    throw new ErroApp('Sessão pertence a outro operador.', { status: 403 });
  }

  const totalItens = itens.reduce((soma, item) => soma + item.subtotalCentavos, 0);
  const totalPagamentos = pagamentos.reduce((soma, pag) => soma + pag.valorCentavos, 0);
  const valorAPagar = totalItens - descontosCentavos;

  if (totalPagamentos < valorAPagar) {
    throw new ErroApp('O valor pago é insuficiente.', { status: 400 });
  }

  const trocoCentavos = totalPagamentos - valorAPagar;

  return emTransacao(() => {
    const resVenda = executar(
      `INSERT INTO vendas_pdv (sessao_id, cliente_nome, cliente_doc, total_centavos, descontos_centavos, troco_centavos)
       VALUES (?, ?, ?, ?, ?, ?)`,
      sessaoId, clienteNome || null, clienteDoc || null, totalItens, descontosCentavos, trocoCentavos
    );
    const vendaId = resVenda.lastInsertRowid;

    for (const item of itens) {
      executar(
        `INSERT INTO itens_venda_pdv (venda_id, produto_nome, quantidade, preco_unitario_centavos, subtotal_centavos)
         VALUES (?, ?, ?, ?, ?)`,
        vendaId, item.produtoNome, item.quantidade, item.precoUnitarioCentavos, item.subtotalCentavos
      );
    }

    for (const pag of pagamentos) {
      executar(
        `INSERT INTO pagamentos_venda_pdv (venda_id, forma_pagamento, valor_centavos)
         VALUES (?, ?, ?)`,
        vendaId, pag.formaPagamento, pag.valorCentavos
      );
    }

    auditoria.registrar({
      ator: operadorEmail,
      acao: 'pdv.venda.registrada',
      entidade: 'venda_pdv',
      entidadeId: vendaId,
      detalhe: { totalItens, descontosCentavos, trocoCentavos }
    });

    return consultarUm('SELECT * FROM vendas_pdv WHERE id = ?', vendaId);
  })();
}

function listarVendas(sessaoId) {
  const vendas = consultar('SELECT * FROM vendas_pdv WHERE sessao_id = ? ORDER BY criado_em DESC', sessaoId);

  for (const venda of vendas) {
    venda.itens = consultar('SELECT * FROM itens_venda_pdv WHERE venda_id = ?', venda.id);
    venda.pagamentos = consultar('SELECT * FROM pagamentos_venda_pdv WHERE venda_id = ?', venda.id);
    venda.nota_fiscal = consultarUm('SELECT * FROM notas_fiscais WHERE origem = "pdv" AND origem_id = ?', venda.id);
  }

  return vendas;
}


module.exports = {
  listarCaixas,
  buscarSessaoAberta,
  abrirCaixa,
  fecharCaixa,
  calcularSaldoEsperado,
  registrarMovimentacao,
  registrarVenda,
  listarVendas
};
