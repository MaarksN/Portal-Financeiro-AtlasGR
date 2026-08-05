'use strict';

const config = require('../../config');
const log = require('../log');
const { consultarUm, executar, emTransacao } = require('../../db');
const funil = require('../funil');

const conectorBitrix = require('./bitrix');
const conectorCsv = require('./csv');
const { criarConector } = require('./rest-generico');

// ------------------------------------------------------------------
// Registro de fontes de cobrança.
//
// A ideia central: a ORIGEM manda nos dados financeiros da fatura
// (valor, vencimento, pagamento, cliente). O PORTAL manda no estágio
// do funil, no responsável e na próxima ação. Por isso o upsert
// abaixo sobrescreve o financeiro e preserva o trabalho do
// financeiro — sincronizar nunca apaga o que a equipe fez.
// ------------------------------------------------------------------

const conectorConnect = criarConector({
  id: 'connect',
  rotulo: 'Connect Plus',
  obterConfig: () => config.connect,
  motivoInativo: 'Defina CONNECT_BASE e CONNECT_TOKEN.',
});

const conectorPerfil = criarConector({
  id: 'perfil',
  rotulo: 'Perfil Securitário',
  obterConfig: () => config.perfil,
  motivoInativo: 'Defina PERFIL_BASE e PERFIL_TOKEN.',
});

const CONECTORES = [conectorBitrix, conectorConnect, conectorPerfil, conectorCsv];
const porId = new Map(CONECTORES.map((c) => [c.id, c]));

function situacao() {
  return CONECTORES.map((c) => {
    const ultima = consultarUm(
      `SELECT estado, registros, novos, atualizados, erro, terminado_em
         FROM sincronizacoes WHERE fonte = ? ORDER BY id DESC LIMIT 1`,
      c.id,
    );
    const total = consultarUm('SELECT count(*) AS n FROM cobrancas WHERE origem = ?', c.id).n;
    return {
      id: c.id,
      rotulo: c.rotulo,
      configurado: c.configurado(),
      motivoInativo: c.configurado() ? null : c.motivoInativo,
      faturas: total,
      ultimaSincronizacao: ultima || null,
    };
  });
}

// ------------------------------ Upsert ------------------------------
function gravar(cobranca) {
  const existente = consultarUm(
    'SELECT * FROM cobrancas WHERE origem = ? AND id_externo = ?',
    cobranca.origem,
    cobranca.idExterno,
  );

  if (!existente) {
    // Estágio inicial vem do tempo: vencida se já passou do prazo.
    const estagioInicial = cobranca.pagamento
      ? 'paga'
      : (funil.diasEmAtraso(cobranca.vencimento) > 0 ? 'vencida' : 'a_vencer');

    executar(
      `INSERT INTO cobrancas (
         origem, id_externo, documento, cliente_nome, cliente_doc, cliente_id_externo,
         valor_centavos, valor_pago_centavos, emissao, vencimento, pagamento,
         estagio, status_origem, url_origem, sincronizado_em
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      cobranca.origem, cobranca.idExterno, cobranca.documento, cobranca.clienteNome,
      cobranca.clienteDoc, cobranca.clienteIdExterno, cobranca.valorCentavos,
      cobranca.valorPagoCentavos, cobranca.emissao, cobranca.vencimento, cobranca.pagamento,
      estagioInicial, cobranca.statusOrigem, cobranca.urlOrigem,
    );
    return 'novo';
  }

  // Dados financeiros: a origem manda. Estágio, responsável, próxima
  // ação e promessa: preservados.
  executar(
    `UPDATE cobrancas
        SET documento = ?, cliente_nome = ?, cliente_doc = ?, cliente_id_externo = ?,
            valor_centavos = ?, valor_pago_centavos = ?, emissao = ?, vencimento = ?,
            pagamento = ?, status_origem = ?, url_origem = ?,
            sincronizado_em = datetime('now'), atualizado_em = datetime('now')
      WHERE id = ?`,
    cobranca.documento, cobranca.clienteNome, cobranca.clienteDoc, cobranca.clienteIdExterno,
    cobranca.valorCentavos, cobranca.valorPagoCentavos, cobranca.emissao, cobranca.vencimento,
    cobranca.pagamento, cobranca.statusOrigem, cobranca.urlOrigem, existente.id,
  );

  // Exceção à regra: se a origem diz que foi paga, o funil acompanha —
  // não faz sentido continuar cobrando quem já pagou.
  if (cobranca.pagamento && existente.estagio !== 'paga') {
    executar(
      `UPDATE cobrancas SET estagio = 'paga', atualizado_em = datetime('now') WHERE id = ?`,
      existente.id,
    );
    executar(
      `INSERT INTO interacoes (cobranca_id, tipo, resumo, de_estagio, para_estagio, autor_email)
       VALUES (?, 'estagio', ?, ?, 'paga', 'sistema')`,
      existente.id,
      `Pagamento identificado na origem (${cobranca.origem}) em ${cobranca.pagamento}.`,
      existente.estagio,
    );
  }

  return 'atualizado';
}

// Envelhecimento: move A vencer -> Vencida quando passa do prazo.
// Só mexe em faturas que ninguém trabalhou ainda (ver funil.js).
function aplicarEnvelhecimento() {
  const { changes } = executar(
    `UPDATE cobrancas
        SET estagio = 'vencida', atualizado_em = datetime('now')
      WHERE estagio = 'a_vencer'
        AND pagamento IS NULL
        AND vencimento < date('now')`,
  );

  // Promessa que passou da data vira promessa quebrada — é o sinal
  // que o financeiro precisa ver no topo da fila.
  const quebradas = executar(
    `UPDATE cobrancas
        SET promessa_quebrada = 1, atualizado_em = datetime('now')
      WHERE estagio = 'promessa'
        AND promessa_quebrada = 0
        AND pagamento IS NULL
        AND promessa_em IS NOT NULL
        AND promessa_em < date('now')`,
  );

  return { vencidas: changes, promessasQuebradas: quebradas.changes };
}

// --------------------------- Sincronização ---------------------------
async function sincronizarFonte(conector) {
  if (!conector.configurado()) {
    return { fonte: conector.id, pulado: true, motivo: conector.motivoInativo };
  }

  const inicio = executar(
    `INSERT INTO sincronizacoes (fonte, estado) VALUES (?, 'rodando')`,
    conector.id,
  );
  const execucaoId = inicio.lastInsertRowid;

  try {
    const cobrancas = await conector.listar();

    let novos = 0;
    let atualizados = 0;
    const aplicar = emTransacao(() => {
      for (const cobranca of cobrancas) {
        if (gravar(cobranca) === 'novo') novos += 1;
        else atualizados += 1;
      }
    });
    aplicar();

    executar(
      `UPDATE sincronizacoes
          SET estado = 'ok', registros = ?, novos = ?, atualizados = ?, terminado_em = datetime('now')
        WHERE id = ?`,
      cobrancas.length, novos, atualizados, execucaoId,
    );

    log.info('Fonte de cobrança sincronizada', { fonte: conector.id, registros: cobrancas.length, novos, atualizados });
    return { fonte: conector.id, registros: cobrancas.length, novos, atualizados };
  } catch (erro) {
    executar(
      `UPDATE sincronizacoes SET estado = 'erro', erro = ?, terminado_em = datetime('now') WHERE id = ?`,
      erro.message, execucaoId,
    );
    log.erro('Falha ao sincronizar fonte de cobrança', { fonte: conector.id, erro: erro.message });
    return { fonte: conector.id, erro: erro.message };
  }
}

async function sincronizarTudo() {
  const resultados = [];
  for (const conector of CONECTORES) {
    // CSV não é puxado — chega por upload.
    if (conector.id === 'csv') continue;
    resultados.push(await sincronizarFonte(conector));
  }
  const envelhecimento = aplicarEnvelhecimento();
  return { fontes: resultados, envelhecimento };
}

// Importação de CSV: mesma gravação, mesmo registro de execução.
function importarCsv(conteudo, { autor }) {
  const { cobrancas, ignoradas, colunas } = conectorCsv.analisar(conteudo);

  const inicio = executar(`INSERT INTO sincronizacoes (fonte, estado) VALUES ('csv', 'rodando')`);
  const execucaoId = inicio.lastInsertRowid;

  let novos = 0;
  let atualizados = 0;
  const aplicar = emTransacao(() => {
    for (const cobranca of cobrancas) {
      if (gravar(cobranca) === 'novo') novos += 1;
      else atualizados += 1;
    }
  });
  aplicar();

  executar(
    `UPDATE sincronizacoes
        SET estado = 'ok', registros = ?, novos = ?, atualizados = ?, terminado_em = datetime('now')
      WHERE id = ?`,
    cobrancas.length, novos, atualizados, execucaoId,
  );

  aplicarEnvelhecimento();
  log.info('CSV de cobranças importado', { autor, registros: cobrancas.length, novos, atualizados });

  return { registros: cobrancas.length, novos, atualizados, ignoradas, colunas };
}

module.exports = {
  CONECTORES,
  porId,
  situacao,
  sincronizarFonte,
  sincronizarTudo,
  aplicarEnvelhecimento,
  importarCsv,
  gravar,
};
