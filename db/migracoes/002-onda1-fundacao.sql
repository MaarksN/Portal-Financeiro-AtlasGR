-- ============================== Onda 1 - Fundação ==============================

CREATE TABLE empresas (
  id             INTEGER PRIMARY KEY,
  cnpj           TEXT    NOT NULL UNIQUE,
  razao_social   TEXT    NOT NULL,
  nome_fantasia  TEXT,
  ativo          INTEGER NOT NULL DEFAULT 1,
  criado_em      TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE filiais (
  id             INTEGER PRIMARY KEY,
  empresa_id     INTEGER NOT NULL REFERENCES empresas (id) ON DELETE CASCADE,
  cnpj           TEXT    NOT NULL UNIQUE,
  nome           TEXT    NOT NULL,
  ativo          INTEGER NOT NULL DEFAULT 1,
  criado_em      TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_filiais_empresa ON filiais (empresa_id);

CREATE TABLE usuarios_empresas (
  usuario_id     INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  empresa_id     INTEGER NOT NULL REFERENCES empresas (id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, empresa_id)
);

CREATE TABLE clientes (
  id             INTEGER PRIMARY KEY,
  documento      TEXT    NOT NULL UNIQUE,
  nome           TEXT    NOT NULL,
  email          TEXT,
  telefone       TEXT,
  criado_em      TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE fornecedores (
  id             INTEGER PRIMARY KEY,
  documento      TEXT    NOT NULL UNIQUE,
  nome           TEXT    NOT NULL,
  email          TEXT,
  telefone       TEXT,
  criado_em      TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE produtos (
  id             INTEGER PRIMARY KEY,
  codigo         TEXT    UNIQUE,
  nome           TEXT    NOT NULL,
  descricao      TEXT,
  preco_centavos INTEGER NOT NULL DEFAULT 0,
  ativo          INTEGER NOT NULL DEFAULT 1,
  criado_em      TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE servicos (
  id             INTEGER PRIMARY KEY,
  codigo         TEXT    UNIQUE,
  nome           TEXT    NOT NULL,
  descricao      TEXT,
  preco_centavos INTEGER NOT NULL DEFAULT 0,
  ativo          INTEGER NOT NULL DEFAULT 1,
  criado_em      TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Adicionando empresa e filial em tabelas existentes.
-- Sqlite ALTER TABLE ADD COLUMN tem restrições, mas aceita criar colunas simples.

ALTER TABLE usuarios ADD COLUMN empresa_id INTEGER REFERENCES empresas (id);
ALTER TABLE usuarios ADD COLUMN filial_id  INTEGER REFERENCES filiais (id);

ALTER TABLE chamados ADD COLUMN empresa_id INTEGER REFERENCES empresas (id);
ALTER TABLE chamados ADD COLUMN filial_id  INTEGER REFERENCES filiais (id);

ALTER TABLE relatorios ADD COLUMN empresa_id INTEGER REFERENCES empresas (id);
ALTER TABLE relatorios ADD COLUMN filial_id  INTEGER REFERENCES filiais (id);

ALTER TABLE cobrancas ADD COLUMN empresa_id INTEGER REFERENCES empresas (id);
ALTER TABLE cobrancas ADD COLUMN filial_id  INTEGER REFERENCES filiais (id);
