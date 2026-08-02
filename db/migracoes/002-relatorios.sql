-- ============================== Relatórios e IA ==============================

-- A infraestrutura base para armazenamento de configurações de relatórios (Wave 6)
CREATE TABLE relatorios_personalizados (
  id             INTEGER PRIMARY KEY,
  titulo         TEXT    NOT NULL,
  autor_email    TEXT    NOT NULL,
  empresa_id     TEXT,                           -- Preparação para Tenant Isolation (Onda 1)
  filial_id      TEXT,
  configuracao   TEXT    NOT NULL,               -- JSON contendo colunas, filtros, agrupamentos
  criado_em      TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_rel_pers_autor ON relatorios_personalizados (autor_email);
CREATE INDEX ix_rel_pers_empresa ON relatorios_personalizados (empresa_id, filial_id);

-- Armazenamento seguro de auditoria de prompts e respostas da IA
CREATE TABLE ia_historico (
  id             INTEGER PRIMARY KEY,
  autor_email    TEXT    NOT NULL,
  empresa_id     TEXT,                           -- Preparação para Tenant Isolation
  modulo         TEXT    NOT NULL DEFAULT 'geral',
  pergunta       TEXT    NOT NULL,
  resposta       TEXT    NOT NULL,
  status         TEXT    NOT NULL DEFAULT 'sucesso', -- sucesso | erro | pendente
  metadados      TEXT,                           -- JSON contendo qual provider gerou, tokens, etc.
  criado_em      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_ia_historico_autor ON ia_historico (autor_email);
CREATE INDEX ix_ia_historico_modulo ON ia_historico (modulo);
