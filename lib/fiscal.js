'use strict';

const { consultar, consultarUm, executar } = require('../db');
const { ErroApp } = require('./erros');
const auditoria = require('./auditoria');

// ------------------------------------------------------------------
// Configurações Fiscais
// ------------------------------------------------------------------
function obterConfiguracao(filial = 'Matriz') {
  let config = consultarUm('SELECT * FROM configuracoes_fiscais WHERE filial = ?', filial);
  if (!config) {
    executar(
      `INSERT INTO configuracoes_fiscais (filial, ambiente) VALUES (?, 'homologacao')`,
      filial
    );
    config = consultarUm('SELECT * FROM configuracoes_fiscais WHERE filial = ?', filial);
  }
  return config;
}

function configurar(filial, dados, operadorEmail) {
  const { ambiente, csc, certificado } = dados;

  if (!['homologacao', 'producao'].includes(ambiente)) {
    throw new ErroApp('Ambiente inválido.', { status: 400 });
  }

  const atual = obterConfiguracao(filial);

  executar(
    `UPDATE configuracoes_fiscais
     SET ambiente = ?, csc = ?, certificado = ?, atualizado_em = datetime('now')
     WHERE id = ?`,
    ambiente,
    csc || atual.csc,
    certificado || atual.certificado,
    atual.id
  );

  auditoria.registrar({
    ator: operadorEmail,
    acao: 'fiscal.configuracao.alterada',
    entidade: 'configuracao_fiscal',
    entidadeId: atual.id,
    detalhe: { filial, ambiente }
  });

  return obterConfiguracao(filial);
}

// ------------------------------------------------------------------
// Emissão de Notas (Simulada para a Onda 5)
// ------------------------------------------------------------------
async function emitirNFCe(vendaId) {
  // Simulando o processo assíncrono de SEFAZ e integração
  const res = executar(
    `INSERT INTO notas_fiscais (origem, origem_id, tipo, status) VALUES (?, ?, ?, ?)`,
    'pdv', vendaId, 'nfce', 'processando'
  );
  const notaId = res.lastInsertRowid;

  // Falso delay de autorização
  return new Promise((resolve) => {
    setTimeout(() => {
      const chaveAcesso = Array.from({length: 44}, () => Math.floor(Math.random() * 10)).join('');

      executar(
        `UPDATE notas_fiscais SET status = 'autorizada', chave_acesso = ?, atualizado_em = datetime('now') WHERE id = ?`,
        chaveAcesso, notaId
      );

      resolve(consultarUm('SELECT * FROM notas_fiscais WHERE id = ?', notaId));
    }, 1500);
  });
}

function consultarNotas(limite = 50) {
  return consultar('SELECT * FROM notas_fiscais ORDER BY criado_em DESC LIMIT ?', limite);
}

module.exports = {
  obterConfiguracao,
  configurar,
  emitirNFCe,
  consultarNotas
};
