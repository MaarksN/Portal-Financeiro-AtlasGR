-- ============================== Financeiro ==============================

-- 10.2 Outras contas (Contas Bancárias, Caixa, etc.)
CREATE TABLE fin_contas (
  id                   INTEGER PRIMARY KEY,
  nome                 TEXT    NOT NULL,
  tipo                 TEXT    NOT NULL, -- corrente | poupanca | carteira | caixa | aplicacao
  instituicao          TEXT,             -- Nome do banco ou instituição
  agencia              TEXT,
  numero               TEXT,
  saldo_inicial_centavos INTEGER NOT NULL DEFAULT 0,
  ativo                INTEGER NOT NULL DEFAULT 1,
  criado_em            TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em        TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 10.11 Categorias financeiras
CREATE TABLE fin_categorias (
  id            INTEGER PRIMARY KEY,
  nome          TEXT    NOT NULL,
  tipo          TEXT    NOT NULL, -- receita | despesa
  pai_id        INTEGER REFERENCES fin_categorias(id) ON DELETE CASCADE,
  ativo         INTEGER NOT NULL DEFAULT 1,
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_fin_categorias_tipo ON fin_categorias(tipo);

-- 10.11 Centros de custo
CREATE TABLE fin_centros_custo (
  id                INTEGER PRIMARY KEY,
  nome              TEXT    NOT NULL,
  codigo            TEXT,
  responsavel_email TEXT,
  ativo             INTEGER NOT NULL DEFAULT 1,
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 10.4, 10.6, 10.8 Lançamentos (Contas a pagar, a receber e movimentações)
CREATE TABLE fin_lancamentos (
  id                  INTEGER PRIMARY KEY,
  tipo                TEXT    NOT NULL, -- pagar | receber
  descricao           TEXT    NOT NULL,
  valor_centavos      INTEGER NOT NULL,
  valor_pago_centavos INTEGER NOT NULL DEFAULT 0,
  data_vencimento     TEXT    NOT NULL, -- YYYY-MM-DD
  data_pagamento      TEXT,             -- YYYY-MM-DD
  conta_id            INTEGER REFERENCES fin_contas(id) ON DELETE SET NULL,
  categoria_id        INTEGER REFERENCES fin_categorias(id) ON DELETE SET NULL,
  centro_custo_id     INTEGER REFERENCES fin_centros_custo(id) ON DELETE SET NULL,
  pessoa              TEXT,             -- Cliente ou Fornecedor
  status              TEXT    NOT NULL DEFAULT 'pendente', -- pendente | pago | cancelado
  observacao          TEXT,
  criado_em           TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em       TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_fin_lancamentos_data ON fin_lancamentos(data_vencimento);
CREATE INDEX ix_fin_lancamentos_status ON fin_lancamentos(status);
CREATE INDEX ix_fin_lancamentos_conta ON fin_lancamentos(conta_id);
