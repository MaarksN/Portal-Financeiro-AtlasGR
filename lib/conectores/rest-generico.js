'use strict';

const http = require('../http');
const { montarCobranca, primeiroPreenchido, extrairLista } = require('./comum');

// ------------------------------------------------------------------
// Fábrica de conector para endpoint REST que devolve JSON — usada pelo
// Connect Plus e pelo Perfil Securitário.
//
// Ambos são sistemas de vocês e eu não tenho credencial para descobrir
// o formato exato de resposta. Então o adaptador é tolerante: aceita o
// array na raiz ou embrulhado (dados/data/items/result) e reconhece os
// nomes de campo mais prováveis em português e inglês. Se a resposta
// real usar outros nomes, o ajuste é só acrescentar o nome na lista
// de candidatos abaixo — nada mais no portal precisa mudar.
// ------------------------------------------------------------------

const CANDIDATOS = {
  idExterno: ['id', 'codigo', 'id_fatura', 'idFatura', 'fatura_id', 'nr_titulo', 'idTitulo', 'numero'],
  documento: ['documento', 'nf', 'nota_fiscal', 'notaFiscal', 'numero_documento', 'numeroDocumento', 'titulo', 'numero'],
  clienteNome: ['cliente', 'cliente_nome', 'clienteNome', 'nome_cliente', 'nomeCliente', 'razao_social', 'razaoSocial', 'customer', 'name'],
  clienteDoc: ['cnpj', 'cpf_cnpj', 'cpfCnpj', 'documento_cliente', 'documentoCliente', 'cnpj_cliente'],
  clienteIdExterno: ['cliente_id', 'clienteId', 'id_cliente', 'idCliente', 'customer_id'],
  valor: ['valor', 'valor_total', 'valorTotal', 'vl_titulo', 'amount', 'total'],
  valorPago: ['valor_pago', 'valorPago', 'vl_pago', 'paid', 'valor_recebido', 'valorRecebido'],
  emissao: ['emissao', 'data_emissao', 'dataEmissao', 'dt_emissao', 'issued_at', 'created_at'],
  vencimento: ['vencimento', 'data_vencimento', 'dataVencimento', 'dt_vencimento', 'due_date', 'dueDate'],
  pagamento: ['pagamento', 'data_pagamento', 'dataPagamento', 'dt_pagamento', 'paid_at', 'paidAt', 'liquidacao'],
  statusOrigem: ['status', 'situacao', 'situação', 'estado', 'status_titulo', 'statusTitulo'],
};

function criarConector({ id, rotulo, obterConfig, motivoInativo }) {
  return {
    id,
    rotulo,
    configurado: () => obterConfig().configurado,
    motivoInativo,

    async listar() {
      const cfg = obterConfig();
      const corpo = await http.json(`${cfg.base}${cfg.caminhoCobrancas}`, {
        cabecalhos: {
          Authorization: `Bearer ${cfg.token}`,
          Accept: 'application/json',
        },
        rotulo,
        timeoutMs: 25000,
      });

      return extrairLista(corpo)
        .map((registro) => montarCobranca(id, {
          idExterno: primeiroPreenchido(registro, CANDIDATOS.idExterno),
          documento: primeiroPreenchido(registro, CANDIDATOS.documento),
          clienteNome: primeiroPreenchido(registro, CANDIDATOS.clienteNome),
          clienteDoc: primeiroPreenchido(registro, CANDIDATOS.clienteDoc),
          clienteIdExterno: primeiroPreenchido(registro, CANDIDATOS.clienteIdExterno),
          valor: primeiroPreenchido(registro, CANDIDATOS.valor),
          valorPago: primeiroPreenchido(registro, CANDIDATOS.valorPago),
          emissao: primeiroPreenchido(registro, CANDIDATOS.emissao),
          vencimento: primeiroPreenchido(registro, CANDIDATOS.vencimento),
          pagamento: primeiroPreenchido(registro, CANDIDATOS.pagamento),
          statusOrigem: primeiroPreenchido(registro, CANDIDATOS.statusOrigem),
        }))
        .filter(Boolean);
    },
  };
}

module.exports = { criarConector, CANDIDATOS };
