-- ------------------------------------------------------------------
-- Migração 002 — ERP: Fundação
-- Adiciona: empresas, filiais, RBAC, favoritos, notificações, importações
-- Expande: usuarios com empresa_id, filial_id, tema, configuracoes
-- ------------------------------------------------------------------

-- ============================== Multi-empresa ==============================

CREATE TABLE empresas (
  id                   INTEGER PRIMARY KEY,
  nome                 TEXT    NOT NULL,
  razao_social         TEXT,
  cnpj                 TEXT    UNIQUE,
  inscricao_estadual   TEXT,
  inscricao_municipal  TEXT,
  regime_tributario    TEXT    NOT NULL DEFAULT 'simples', -- simples | lucro_presumido | lucro_real
  endereco             TEXT,                               -- JSON
  telefone             TEXT,
  email                TEXT,
  site                 TEXT,
  logo_url             TEXT,
  ativa                INTEGER NOT NULL DEFAULT 1,
  configuracoes        TEXT    NOT NULL DEFAULT '{}',      -- JSON
  criado_em            TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE filiais (
  id                   INTEGER PRIMARY KEY,
  empresa_id           INTEGER NOT NULL REFERENCES empresas(id),
  nome                 TEXT    NOT NULL,
  cnpj                 TEXT,
  inscricao_estadual   TEXT,
  inscricao_municipal  TEXT,
  endereco             TEXT,                               -- JSON
  telefone             TEXT,
  email                TEXT,
  ativa                INTEGER NOT NULL DEFAULT 1,
  principal            INTEGER NOT NULL DEFAULT 0,
  criado_em            TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_filiais_empresa ON filiais(empresa_id);

-- ============================== RBAC ==============================

CREATE TABLE papeis (
  id           INTEGER PRIMARY KEY,
  nome         TEXT    NOT NULL UNIQUE,
  descricao    TEXT,
  permissoes   TEXT    NOT NULL DEFAULT '[]',   -- JSON: ['financeiro:ver','vendas:criar']
  sistema      INTEGER NOT NULL DEFAULT 0,      -- papéis de sistema não podem ser deletados
  criado_em    TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT   NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE usuario_papeis (
  id         INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  papel_id   INTEGER NOT NULL REFERENCES papeis(id) ON DELETE CASCADE,
  empresa_id INTEGER REFERENCES empresas(id),
  filial_id  INTEGER REFERENCES filiais(id),
  criado_em  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(usuario_id, papel_id, empresa_id, filial_id)
);
CREATE INDEX ix_usuario_papeis_usuario ON usuario_papeis(usuario_id);

CREATE TABLE usuario_permissoes (
  id          INTEGER PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  permissao   TEXT    NOT NULL,   -- 'modulo:acao' ex: 'financeiro:baixar_pagamento'
  conceder    INTEGER NOT NULL DEFAULT 1,   -- 1=conceder 0=negar
  criado_em   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_usuario_permissoes_usuario ON usuario_permissoes(usuario_id);

-- Expandir tabela de usuários
ALTER TABLE usuarios ADD COLUMN empresa_id  INTEGER REFERENCES empresas(id);
ALTER TABLE usuarios ADD COLUMN filial_id   INTEGER REFERENCES filiais(id);
ALTER TABLE usuarios ADD COLUMN tema        TEXT    NOT NULL DEFAULT 'escuro';
ALTER TABLE usuarios ADD COLUMN configuracoes TEXT  NOT NULL DEFAULT '{}';

-- ============================== Favoritos ==============================

CREATE TABLE favoritos (
  id          INTEGER PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo        TEXT    NOT NULL,   -- pagina | cliente | fornecedor | produto | relatorio | venda | compra | contrato
  entidade_id TEXT,               -- ID do registro (NULL para páginas)
  rotulo      TEXT    NOT NULL,
  url         TEXT    NOT NULL,
  pasta       TEXT,
  ordem       INTEGER NOT NULL DEFAULT 0,
  criado_em   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_favoritos_usuario ON favoritos(usuario_id);

-- ============================== Notificações ==============================

CREATE TABLE notificacoes (
  id          INTEGER PRIMARY KEY,
  usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,   -- NULL = todos
  tipo        TEXT    NOT NULL DEFAULT 'info',   -- alerta | info | sucesso | erro
  titulo      TEXT    NOT NULL,
  mensagem    TEXT    NOT NULL,
  modulo      TEXT,
  entidade    TEXT,
  entidade_id TEXT,
  url         TEXT,
  lida        INTEGER NOT NULL DEFAULT 0,
  lida_em     TEXT,
  criado_em   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_notificacoes_usuario ON notificacoes(usuario_id, lida, criado_em);

-- ============================== Importações ==============================

CREATE TABLE importacoes (
  id                 INTEGER PRIMARY KEY,
  usuario_email      TEXT    NOT NULL,
  entidade           TEXT    NOT NULL,   -- clientes | fornecedores | produtos | contas_pagar | etc
  formato            TEXT    NOT NULL,   -- csv | xlsx | json | xml | ofx | cnab
  nome_arquivo       TEXT    NOT NULL,
  total_linhas       INTEGER NOT NULL DEFAULT 0,
  linhas_ok          INTEGER NOT NULL DEFAULT 0,
  linhas_erro        INTEGER NOT NULL DEFAULT 0,
  linhas_duplicadas  INTEGER NOT NULL DEFAULT 0,
  estado             TEXT    NOT NULL DEFAULT 'pendente',   -- pendente | processando | concluido | erro | desfeito
  pode_desfazer      INTEGER NOT NULL DEFAULT 1,
  desfeito_em        TEXT,
  erro               TEXT,
  criado_em          TEXT    NOT NULL DEFAULT (datetime('now')),
  concluido_em       TEXT
);
CREATE INDEX ix_importacoes_estado ON importacoes(estado);

CREATE TABLE importacao_logs (
  id              INTEGER PRIMARY KEY,
  importacao_id   INTEGER NOT NULL REFERENCES importacoes(id) ON DELETE CASCADE,
  linha           INTEGER NOT NULL,
  estado          TEXT    NOT NULL,   -- ok | erro | duplicado | atualizado
  mensagem        TEXT,
  dados_originais TEXT,               -- JSON
  entidade_id     TEXT,               -- ID criado/atualizado
  criado_em       TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_importacao_logs_importacao ON importacao_logs(importacao_id);

-- ============================== Seed de empresa padrão ==============================
-- Inserido aqui para que todas as migrações seguintes possam referenciar empresa_id = 1

INSERT INTO empresas (id, nome, razao_social, cnpj, regime_tributario, ativa)
VALUES (1, 'Atlas GR', 'Atlas GR Ltda', NULL, 'simples', 1);

INSERT INTO filiais (id, empresa_id, nome, ativa, principal)
VALUES (1, 1, 'Matriz', 1, 1);

-- Papéis de sistema
INSERT INTO papeis (nome, descricao, permissoes, sistema) VALUES
  ('admin',             'Administrador geral — acesso total',        '["*"]', 1),
  ('diretor',           'Diretor — acesso gerencial completo',       '["inicio:*","financeiro:*","vendas:*","compras:*","estoque:*","relatorios:*","integracoes:ver","auditoria:ver"]', 1),
  ('gestor_financeiro', 'Gestor financeiro',                         '["inicio:*","financeiro:*","relatorios:financeiro","relatorios:dre","relatorios:fluxo_caixa","compras:aprovar"]', 1),
  ('analista_financeiro','Analista financeiro',                      '["inicio:ver","financeiro:ver","financeiro:lancar","financeiro:baixar","relatorios:financeiro"]', 1),
  ('gestor_comercial',  'Gestor comercial',                          '["inicio:*","vendas:*","clientes:*","relatorios:vendas"]', 1),
  ('vendedor',          'Vendedor',                                  '["inicio:ver","vendas:ver","vendas:criar_orcamento","vendas:criar_venda","clientes:ver","clientes:criar","produtos:ver"]', 1),
  ('comprador',         'Comprador',                                 '["inicio:ver","compras:*","fornecedores:*","estoque:ver","produtos:ver"]', 1),
  ('estoquista',        'Estoquista',                                '["inicio:ver","estoque:*","produtos:ver"]', 1),
  ('operador_caixa',    'Operador de caixa / PDV',                   '["inicio:ver","pdv:*","produtos:ver","clientes:ver"]', 1),
  ('fiscal',            'Fiscal',                                    '["inicio:ver","fiscal:*","vendas:ver","compras:ver"]', 1),
  ('contador',          'Contador',                                  '["inicio:ver","financeiro:ver","relatorios:*","fiscal:ver"]', 1),
  ('auditor',           'Auditor',                                   '["inicio:ver","auditoria:*","relatorios:*","financeiro:ver","vendas:ver","compras:ver","estoque:ver"]', 1),
  ('tecnico_servicos',  'Técnico de serviços',                       '["inicio:ver","servicos:ver","servicos:os","clientes:ver"]', 1),
  ('leitura',           'Somente leitura',                           '["inicio:ver","financeiro:ver","vendas:ver","compras:ver","estoque:ver","relatorios:ver"]', 1);
