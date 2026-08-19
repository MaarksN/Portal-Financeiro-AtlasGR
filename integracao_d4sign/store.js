// Camada de persistencia para o vinculo Deal(Bitrix24) <-> Documento(D4Sign)
// e para o historico de cobrancas mensais (evita gerar boleto/nota em duplicidade).
//
// Se DATABASE_URL estiver configurada, usa Postgres (recomendado em producao,
// especialmente no Render, onde o disco de Web Services/Cron Jobs no plano
// free NAO e persistente entre deploys/execucoes).
// Caso contrario, cai para um arquivo JSON local (apenas para rodar/testar
// na sua maquina).

const fs = require("fs");
const path = require("path");
const config = require("./config");
const logger = require("./logger");

const LOCAL_FILE = path.join(__dirname, "data", "mapping.json");

let pgPool = null;
function getPool() {
  if (!pgPool) {
    const { Pool } = require("pg");
    pgPool = new Pool({ connectionString: config.databaseUrl, ssl: { rejectUnauthorized: false } });
  }
  return pgPool;
}

function readLocalFile() {
  try {
    const raw = fs.readFileSync(LOCAL_FILE, "utf8");
    const data = JSON.parse(raw);
    if (!data.deals) data.deals = [];
    return data;
  } catch {
    return { contracts: [], billingRuns: [], deals: [] };
  }
}

function writeLocalFile(data) {
  fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(data, null, 2));
}

const usingPostgres = Boolean(config.databaseUrl);

if (!usingPostgres) {
  logger.warn(
    "DATABASE_URL nao configurada - usando data/mapping.json local. " +
      "Configure um Postgres (ex.: Render Postgres) antes de ir para producao."
  );
}

async function saveContractLink({ dealId, d4signUuid, status }) {
  if (usingPostgres) {
    await getPool().query(
      `INSERT INTO contract_links (deal_id, d4sign_uuid, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (deal_id) DO UPDATE
         SET d4sign_uuid = EXCLUDED.d4sign_uuid,
             status = EXCLUDED.status,
             updated_at = now()`,
      [dealId, d4signUuid, status]
    );
    return;
  }
  const data = readLocalFile();
  const existing = data.contracts.find((c) => c.dealId === dealId);
  if (existing) {
    existing.d4signUuid = d4signUuid;
    existing.status = status;
    existing.updatedAt = new Date().toISOString();
  } else {
    data.contracts.push({ dealId, d4signUuid, status, createdAt: new Date().toISOString() });
  }
  writeLocalFile(data);
}

async function updateContractStatusByD4signUuid(d4signUuid, status) {
  if (usingPostgres) {
    const result = await getPool().query(
      `UPDATE contract_links SET status = $2, updated_at = now()
       WHERE d4sign_uuid = $1 RETURNING deal_id`,
      [d4signUuid, status]
    );
    return result.rows[0]?.deal_id || null;
  }
  const data = readLocalFile();
  const existing = data.contracts.find((c) => c.d4signUuid === d4signUuid);
  if (!existing) return null;
  existing.status = status;
  existing.updatedAt = new Date().toISOString();
  writeLocalFile(data);
  return existing.dealId;
}

async function findDealIdByD4signUuid(d4signUuid) {
  if (usingPostgres) {
    const result = await getPool().query(`SELECT deal_id FROM contract_links WHERE d4sign_uuid = $1`, [d4signUuid]);
    return result.rows[0]?.deal_id || null;
  }
  const data = readLocalFile();
  return data.contracts.find((c) => c.d4signUuid === d4signUuid)?.dealId || null;
}

async function wasBilledThisMonth(dealId, referenceMonth) {
  if (usingPostgres) {
    const result = await getPool().query(
      `SELECT 1 FROM billing_runs WHERE deal_id = $1 AND reference_month = $2`,
      [dealId, referenceMonth]
    );
    return result.rowCount > 0;
  }
  const data = readLocalFile();
  return data.billingRuns.some((b) => b.dealId === dealId && b.referenceMonth === referenceMonth);
}

async function recordBillingRun({ dealId, referenceMonth, boletoStatus, notaStatus, detail }) {
  if (usingPostgres) {
    await getPool().query(
      `INSERT INTO billing_runs (deal_id, reference_month, boleto_status, nota_status, detail)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (deal_id, reference_month) DO UPDATE
         SET boleto_status = EXCLUDED.boleto_status,
             nota_status = EXCLUDED.nota_status,
             detail = EXCLUDED.detail`,
      [dealId, referenceMonth, boletoStatus, notaStatus, JSON.stringify(detail || {})]
    );
    return;
  }
  const data = readLocalFile();
  data.billingRuns.push({
    dealId,
    referenceMonth,
    boletoStatus,
    notaStatus,
    detail,
    createdAt: new Date().toISOString(),
  });
  writeLocalFile(data);
}

/**
 * Guarda/atualiza um "retrato" financeiro do negocio (deal) do Bitrix24 -
 * cliente, valor, plano, vencimento - para a carteira do painel poder
 * listar tudo sem precisar consultar o Bitrix24 a cada carregamento de
 * tela. Chamado sempre que o servico toca um deal (gerar contrato ou
 * rodar a cobranca mensal).
 */
async function upsertDeal(deal) {
  const row = {
    dealId: String(deal.dealId),
    title: deal.dealTitle || deal.title || null,
    clientName: deal.clientName || null,
    clientEmail: deal.clientEmail || null,
    clientCpfCnpj: deal.clientCpfCnpj || null,
    value: deal.value != null ? Number(deal.value) : null,
    currency: deal.currency || null,
    plano: deal.plano || null,
    vencimentoDia: deal.vencimentoDia || null,
  };

  if (usingPostgres) {
    await getPool().query(
      `INSERT INTO deals (deal_id, title, client_name, client_email, client_cpf_cnpj, value, currency, plano, vencimento_dia)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (deal_id) DO UPDATE
         SET title = COALESCE(EXCLUDED.title, deals.title),
             client_name = COALESCE(EXCLUDED.client_name, deals.client_name),
             client_email = COALESCE(EXCLUDED.client_email, deals.client_email),
             client_cpf_cnpj = COALESCE(EXCLUDED.client_cpf_cnpj, deals.client_cpf_cnpj),
             value = COALESCE(EXCLUDED.value, deals.value),
             currency = COALESCE(EXCLUDED.currency, deals.currency),
             plano = COALESCE(EXCLUDED.plano, deals.plano),
             vencimento_dia = COALESCE(EXCLUDED.vencimento_dia, deals.vencimento_dia),
             updated_at = now()`,
      [row.dealId, row.title, row.clientName, row.clientEmail, row.clientCpfCnpj, row.value, row.currency, row.plano, row.vencimentoDia]
    );
    return;
  }

  const data = readLocalFile();
  const existing = data.deals.find((d) => d.dealId === row.dealId);
  if (existing) {
    Object.keys(row).forEach((key) => {
      if (row[key] !== null && row[key] !== undefined) existing[key] = row[key];
    });
    existing.updatedAt = new Date().toISOString();
  } else {
    data.deals.push({ ...row, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
  writeLocalFile(data);
}

/** Lista todos os "retratos" de deals guardados (carteira). */
async function listDeals() {
  if (usingPostgres) {
    const result = await getPool().query(`SELECT * FROM deals ORDER BY updated_at DESC`);
    return result.rows.map((r) => ({
      dealId: r.deal_id,
      title: r.title,
      clientName: r.client_name,
      clientEmail: r.client_email,
      clientCpfCnpj: r.client_cpf_cnpj,
      value: r.value != null ? Number(r.value) : null,
      currency: r.currency,
      plano: r.plano,
      vencimentoDia: r.vencimento_dia,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }
  const data = readLocalFile();
  return [...data.deals].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

/** Lista todos os vinculos deal<->documento D4Sign (status do contrato). */
async function listContractLinks() {
  if (usingPostgres) {
    const result = await getPool().query(`SELECT * FROM contract_links ORDER BY updated_at DESC`);
    return result.rows.map((r) => ({
      dealId: r.deal_id,
      d4signUuid: r.d4sign_uuid,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }
  const data = readLocalFile();
  return [...data.contracts];
}

/** Lista execucoes de cobranca (todas, ou filtradas por mes de referencia). */
async function listBillingRuns({ referenceMonth } = {}) {
  if (usingPostgres) {
    const result = referenceMonth
      ? await getPool().query(`SELECT * FROM billing_runs WHERE reference_month = $1 ORDER BY created_at DESC`, [referenceMonth])
      : await getPool().query(`SELECT * FROM billing_runs ORDER BY created_at DESC LIMIT 500`);
    return result.rows.map((r) => ({
      dealId: r.deal_id,
      referenceMonth: r.reference_month,
      boletoStatus: r.boleto_status,
      notaStatus: r.nota_status,
      detail: r.detail,
      createdAt: r.created_at,
    }));
  }
  const data = readLocalFile();
  const runs = referenceMonth ? data.billingRuns.filter((b) => b.referenceMonth === referenceMonth) : data.billingRuns;
  return [...runs].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

module.exports = {
  saveContractLink,
  updateContractStatusByD4signUuid,
  findDealIdByD4signUuid,
  wasBilledThisMonth,
  recordBillingRun,
  upsertDeal,
  listDeals,
  listContractLinks,
  listBillingRuns,
};
