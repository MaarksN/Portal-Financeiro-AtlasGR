'use strict';

const config = require('../../config');
const bitrix = require('../bitrix');
const { montarCobranca, primeiroPreenchido } = require('./comum');

// Conector da SPA de cobrança do Bitrix24. Os nomes dos campos
// customizados vêm do config (sobrescrevíveis pelo .env), porque cada
// provisionamento gera nomes diferentes.

const campos = () => config.bitrix.campos;

module.exports = {
  id: 'bitrix',
  rotulo: 'Bitrix24',
  configurado: () => bitrix.configurado() && Boolean(config.bitrix.entidadeCobranca),
  motivoInativo: 'Defina BITRIX_WEBHOOK e ENTITY_TYPE_ID_COBRANCA.',

  async listar() {
    const c = campos();
    const itens = await bitrix.listarItens(config.bitrix.entidadeCobranca, {
      ordem: { id: 'DESC' },
      maximo: 2000,
    });

    return itens
      .map((item) => montarCobranca('bitrix', {
        idExterno: item.id,
        documento: primeiroPreenchido(item, [c.documento, 'title']),
        clienteNome: primeiroPreenchido(item, [c.cliente, 'title']),
        clienteDoc: primeiroPreenchido(item, [c.clienteDoc]),
        clienteIdExterno: primeiroPreenchido(item, ['companyId', 'contactId']),
        valor: primeiroPreenchido(item, [c.valor, 'opportunity']),
        valorPago: primeiroPreenchido(item, [c.valorPago]),
        emissao: primeiroPreenchido(item, [c.emissao, 'createdTime']),
        vencimento: primeiroPreenchido(item, [c.vencimento]),
        pagamento: primeiroPreenchido(item, [c.pagamento]),
        statusOrigem: primeiroPreenchido(item, ['stageId']),
      }))
      .filter(Boolean);
  },
};
