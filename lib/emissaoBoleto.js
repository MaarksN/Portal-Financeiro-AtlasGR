'use strict';

const config = require('../config');
const { ErroApp } = require('./erros');

// ------------------------------------------------------------------
// Emissão de boleto registrado (Sicredi). Estrutura pronta — rota,
// permissão, ponto de chamada na tela — mas DESLIGADA: emitir um
// boleto de verdade, com código de barras válido, exige convênio de
// cobrança com o banco (código de cedente, carteira, certificado mTLS
// pra autenticar na API deles) que este ambiente não tem. Sem isso,
// toda chamada aqui recusa com uma mensagem clara. Nunca simula uma
// emissão como se fosse real — ver lib/conectores/boleto.js para o
// caminho inverso (LER um boleto emitido em outro lugar).
// ------------------------------------------------------------------

function configurado() {
  return config.sicredi.configurado;
}

function exigirConfigurado() {
  if (!configurado()) {
    throw new ErroApp(
      'Emissão de boleto não configurada — falta o convênio Sicredi '
      + '(SICREDI_CLIENT_ID, SICREDI_CLIENT_SECRET, SICREDI_CERTIFICADO_PATH, SICREDI_CODIGO_CEDENTE) no .env.',
      { status: 503, codigo: 'emissao_nao_configurada' },
    );
  }
}

// ------------------------------------------------------------------
// Contrato que uma implementação real precisa cumprir — documentado
// mesmo desligado, pra quem for ativar não ter que redescobrir isso:
//
// 1. Autenticar via OAuth2 client_credentials com mTLS (client_id +
//    client_secret + certificado) no ambiente configurado
//    (homologação primeiro, sempre).
// 2. Registrar o boleto: código de cedente, carteira, posto, um
//    "nosso número" sequencial próprio, dados do sacado (nome, CNPJ),
//    valor, vencimento e instruções (multa/juros) — ver os mesmos
//    campos que lib/conectores/boleto.js já sabe LER de um boleto
//    existente.
// 3. A resposta do banco traz o nosso número definitivo, a linha
//    digitável, o código de barras e a URL do PDF — isso é o que vira
//    documento/observação na cobrança, não algo inventado aqui.
// 4. Assinar o webhook de baixa automática da Sicredi, pra marcar
//    `pagamento` na cobrança quando o banco confirmar — sem isso, a
//    baixa continua manual.
//
// async function emitir(cobranca) { ... }
// ------------------------------------------------------------------

async function emitir() {
  exigirConfigurado();
  // Não alcançável enquanto `configurado()` for falso — ver contrato acima.
}

module.exports = { configurado, exigirConfigurado, emitir };
