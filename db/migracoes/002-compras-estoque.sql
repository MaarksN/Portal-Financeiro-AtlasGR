-- ============================== Compras e Estoque ==============================

CREATE TABLE fornecedores (
  id                INTEGER PRIMARY KEY,
  documento         TEXT    NOT NULL UNIQUE, -- CNPJ ou CPF
  razao_social      TEXT    NOT NULL,
  nome_fantasia     TEXT,
  email             TEXT,
  telefone          TEXT,
  ativo             INTEGER NOT NULL DEFAULT 1,
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE produtos (
  id                INTEGER PRIMARY KEY,
  codigo            TEXT    UNIQUE,
  nome              TEXT    NOT NULL,
  descricao         TEXT,
  unidade_medida    TEXT    NOT NULL DEFAULT 'UN',
  categoria         TEXT,
  ativo             INTEGER NOT NULL DEFAULT 1,
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE estoque_locais (
  id                INTEGER PRIMARY KEY,
  nome              TEXT    NOT NULL,
  descricao         TEXT,
  ativo             INTEGER NOT NULL DEFAULT 1,
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE estoques (
  id                INTEGER PRIMARY KEY,
  produto_id        INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  local_id          INTEGER NOT NULL REFERENCES estoque_locais(id) ON DELETE CASCADE,
  quantidade        INTEGER NOT NULL DEFAULT 0,
  minimo            INTEGER NOT NULL DEFAULT 0,
  maximo            INTEGER,
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em     TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(produto_id, local_id)
);

CREATE TABLE estoque_movimentacoes (
  id                INTEGER PRIMARY KEY,
  produto_id        INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  local_id          INTEGER NOT NULL REFERENCES estoque_locais(id) ON DELETE CASCADE,
  tipo              TEXT    NOT NULL, -- entrada | saida | ajuste
  quantidade        INTEGER NOT NULL,
  motivo            TEXT,
  usuario_email     TEXT    NOT NULL,
  referencia        TEXT, -- ex: pedido ou nf vinculada
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE compras_solicitacoes (
  id                INTEGER PRIMARY KEY,
  solicitante_email TEXT    NOT NULL,
  centro_custo      TEXT,
  status            TEXT    NOT NULL DEFAULT 'pendente', -- pendente | aprovado | cotacao | rejeitado
  justificativa     TEXT,
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE compras_solicitacao_itens (
  id                INTEGER PRIMARY KEY,
  solicitacao_id    INTEGER NOT NULL REFERENCES compras_solicitacoes(id) ON DELETE CASCADE,
  produto_id        INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  quantidade        INTEGER NOT NULL,
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE compras_pedidos (
  id                INTEGER PRIMARY KEY,
  solicitacao_id    INTEGER REFERENCES compras_solicitacoes(id) ON DELETE SET NULL,
  fornecedor_id     INTEGER NOT NULL REFERENCES fornecedores(id) ON DELETE RESTRICT,
  comprador_email   TEXT    NOT NULL,
  status            TEXT    NOT NULL DEFAULT 'emitido', -- emitido | recebido_parcial | recebido_total | cancelado
  total_centavos    INTEGER NOT NULL DEFAULT 0,
  prazo_entrega     TEXT, -- YYYY-MM-DD
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE compras_pedido_itens (
  id                INTEGER PRIMARY KEY,
  pedido_id         INTEGER NOT NULL REFERENCES compras_pedidos(id) ON DELETE CASCADE,
  produto_id        INTEGER NOT NULL REFERENCES produtos(id) ON DELETE RESTRICT,
  quantidade        INTEGER NOT NULL,
  valor_unitario    INTEGER NOT NULL DEFAULT 0, -- em centavos
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now'))
);
