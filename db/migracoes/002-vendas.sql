-- ============================== Onda 3: Vendas ==============================

CREATE TABLE clientes (
  id                INTEGER PRIMARY KEY,
  tipo              TEXT    NOT NULL, -- PF ou PJ
  nome              TEXT    NOT NULL,
  documento         TEXT    UNIQUE, -- CPF ou CNPJ
  email             TEXT,
  telefone          TEXT,
  endereco          TEXT,
  limite_credito    INTEGER NOT NULL DEFAULT 0,
  vendedor_email    TEXT,
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_clientes_documento ON clientes (documento);

CREATE TABLE produtos (
  id                INTEGER PRIMARY KEY,
  nome              TEXT    NOT NULL,
  sku               TEXT    UNIQUE,
  descricao         TEXT,
  categoria         TEXT,
  marca             TEXT,
  unidade           TEXT,
  custo_centavos    INTEGER NOT NULL DEFAULT 0,
  preco_centavos    INTEGER NOT NULL DEFAULT 0,
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_produtos_sku ON produtos (sku);

CREATE TABLE servicos (
  id                INTEGER PRIMARY KEY,
  nome              TEXT    NOT NULL,
  codigo            TEXT    UNIQUE,
  descricao         TEXT,
  categoria         TEXT,
  preco_centavos    INTEGER NOT NULL DEFAULT 0,
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE orcamentos (
  id                INTEGER PRIMARY KEY,
  numero            TEXT    NOT NULL UNIQUE,
  cliente_id        INTEGER NOT NULL REFERENCES clientes (id),
  vendedor_email    TEXT    NOT NULL,
  status            TEXT    NOT NULL DEFAULT 'rascunho', -- rascunho | enviado | aprovado | rejeitado | convertido
  valor_centavos    INTEGER NOT NULL DEFAULT 0,
  validade          TEXT,
  observacoes       TEXT,
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_orcamentos_cliente ON orcamentos (cliente_id);

CREATE TABLE vendas (
  id                INTEGER PRIMARY KEY,
  numero            TEXT    NOT NULL UNIQUE,
  orcamento_id      INTEGER REFERENCES orcamentos (id),
  cliente_id        INTEGER NOT NULL REFERENCES clientes (id),
  vendedor_email    TEXT    NOT NULL,
  status            TEXT    NOT NULL DEFAULT 'aberta', -- aberta | faturada | cancelada | devolvida
  valor_centavos    INTEGER NOT NULL DEFAULT 0,
  data_venda        TEXT    NOT NULL DEFAULT (datetime('now')),
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_vendas_cliente ON vendas (cliente_id);

CREATE TABLE itens_de_venda (
  id                INTEGER PRIMARY KEY,
  venda_id          INTEGER NOT NULL REFERENCES vendas (id) ON DELETE CASCADE,
  produto_id        INTEGER REFERENCES produtos (id),
  servico_id        INTEGER REFERENCES servicos (id),
  quantidade        INTEGER NOT NULL DEFAULT 1,
  preco_centavos    INTEGER NOT NULL,
  desconto_centavos INTEGER NOT NULL DEFAULT 0,
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_itens_de_venda_venda ON itens_de_venda (venda_id);

CREATE TABLE contratos (
  id                INTEGER PRIMARY KEY,
  numero            TEXT    NOT NULL UNIQUE,
  cliente_id        INTEGER NOT NULL REFERENCES clientes (id),
  vendedor_email    TEXT    NOT NULL,
  status            TEXT    NOT NULL DEFAULT 'ativo', -- ativo | suspenso | cancelado | finalizado
  valor_centavos    INTEGER NOT NULL DEFAULT 0,
  inicio            TEXT    NOT NULL,
  fim               TEXT,
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_contratos_cliente ON contratos (cliente_id);

CREATE TABLE parcelas (
  id                INTEGER PRIMARY KEY,
  venda_id          INTEGER REFERENCES vendas (id) ON DELETE CASCADE,
  contrato_id       INTEGER REFERENCES contratos (id) ON DELETE CASCADE,
  numero_parcela    INTEGER NOT NULL,
  valor_centavos    INTEGER NOT NULL,
  vencimento        TEXT    NOT NULL,
  status            TEXT    NOT NULL DEFAULT 'aberta', -- aberta | paga | atrasada | cancelada
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_parcelas_venda ON parcelas (venda_id);
CREATE INDEX ix_parcelas_contrato ON parcelas (contrato_id);

CREATE TABLE comissoes (
  id                INTEGER PRIMARY KEY,
  venda_id          INTEGER REFERENCES vendas (id) ON DELETE CASCADE,
  contrato_id       INTEGER REFERENCES contratos (id) ON DELETE CASCADE,
  vendedor_email    TEXT    NOT NULL,
  valor_centavos    INTEGER NOT NULL,
  status            TEXT    NOT NULL DEFAULT 'pendente', -- pendente | liberada | paga | cancelada
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_comissoes_venda ON comissoes (venda_id);
