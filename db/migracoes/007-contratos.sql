-- Módulo Contratos & Cobrança (Bitrix24 -> D4Sign -> Bitrix24 + NXFacil).
-- Retrato do deal, vínculo com o documento assinado, e histórico da
-- cobrança mensal — tudo no mesmo banco do portal (sem serviço à parte).

CREATE TABLE IF NOT EXISTS contratos_deals (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id          TEXT NOT NULL UNIQUE,
  titulo           TEXT,
  cliente_nome     TEXT,
  cliente_email    TEXT,
  cliente_documento TEXT,
  valor_centavos   INTEGER,
  moeda            TEXT,
  plano            TEXT,
  vencimento_dia   TEXT,
  criado_em        TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contratos_links (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id        TEXT NOT NULL UNIQUE,
  d4sign_uuid    TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'sent', -- sent | signed | cancelled
  criado_em      TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contratos_links_d4sign_uuid ON contratos_links (d4sign_uuid);

CREATE TABLE IF NOT EXISTS contratos_cobrancas (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id         TEXT NOT NULL,
  mes_referencia  TEXT NOT NULL, -- formato 'YYYY-MM'
  boleto_status   TEXT NOT NULL DEFAULT 'pending', -- pending | ok | error | mock
  nota_status     TEXT NOT NULL DEFAULT 'pending',
  detalhe         TEXT,
  criado_em       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (deal_id, mes_referencia)
);
