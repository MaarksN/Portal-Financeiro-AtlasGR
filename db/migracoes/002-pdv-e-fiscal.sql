-- ============================== Frente de Caixa (PDV) ==============================

CREATE TABLE caixas (
  id            INTEGER PRIMARY KEY,
  nome          TEXT    NOT NULL,
  filial        TEXT    NOT NULL DEFAULT 'Matriz',
  ativo         INTEGER NOT NULL DEFAULT 1,
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessoes_caixa (
  id               INTEGER PRIMARY KEY,
  caixa_id         INTEGER NOT NULL REFERENCES caixas (id),
  operador_email   TEXT    NOT NULL,
  status           TEXT    NOT NULL DEFAULT 'aberto', -- aberto | fechado
  aberto_em        TEXT    NOT NULL DEFAULT (datetime('now')),
  fechado_em       TEXT,
  saldo_inicial    INTEGER NOT NULL DEFAULT 0,
  saldo_esperado   INTEGER,
  saldo_informado  INTEGER,
  criado_em        TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_sessoes_caixa_operador ON sessoes_caixa (operador_email);
CREATE INDEX ix_sessoes_caixa_status ON sessoes_caixa (status);

CREATE TABLE movimentacoes_caixa (
  id             INTEGER PRIMARY KEY,
  sessao_id      INTEGER NOT NULL REFERENCES sessoes_caixa (id) ON DELETE CASCADE,
  tipo           TEXT    NOT NULL, -- sangria | suprimento
  valor_centavos INTEGER NOT NULL,
  justificativa  TEXT,
  criado_em      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_movimentacoes_sessao ON movimentacoes_caixa (sessao_id);

CREATE TABLE vendas_pdv (
  id                 INTEGER PRIMARY KEY,
  sessao_id          INTEGER NOT NULL REFERENCES sessoes_caixa (id),
  cliente_nome       TEXT,
  cliente_doc        TEXT,
  total_centavos     INTEGER NOT NULL,
  descontos_centavos INTEGER NOT NULL DEFAULT 0,
  troco_centavos     INTEGER NOT NULL DEFAULT 0,
  status             TEXT    NOT NULL DEFAULT 'concluida', -- concluida | cancelada
  criado_em          TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_vendas_pdv_sessao ON vendas_pdv (sessao_id);

CREATE TABLE itens_venda_pdv (
  id                      INTEGER PRIMARY KEY,
  venda_id                INTEGER NOT NULL REFERENCES vendas_pdv (id) ON DELETE CASCADE,
  produto_nome            TEXT    NOT NULL,
  quantidade              REAL    NOT NULL,
  preco_unitario_centavos INTEGER NOT NULL,
  subtotal_centavos       INTEGER NOT NULL
);
CREATE INDEX ix_itens_venda_pdv ON itens_venda_pdv (venda_id);

CREATE TABLE pagamentos_venda_pdv (
  id               INTEGER PRIMARY KEY,
  venda_id         INTEGER NOT NULL REFERENCES vendas_pdv (id) ON DELETE CASCADE,
  forma_pagamento  TEXT    NOT NULL, -- dinheiro | cartao | pix | boleto | crediario
  valor_centavos   INTEGER NOT NULL
);
CREATE INDEX ix_pagamentos_venda_pdv ON pagamentos_venda_pdv (venda_id);


-- ============================== Fiscal ==============================

CREATE TABLE configuracoes_fiscais (
  id              INTEGER PRIMARY KEY,
  filial          TEXT    NOT NULL UNIQUE,
  ambiente        TEXT    NOT NULL DEFAULT 'homologacao', -- homologacao | producao
  certificado     TEXT,   -- Nome do arquivo de certificado (simulado)
  csc             TEXT,
  ativo           INTEGER NOT NULL DEFAULT 1,
  criado_em       TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE notas_fiscais (
  id              INTEGER PRIMARY KEY,
  origem          TEXT    NOT NULL, -- pdv
  origem_id       TEXT    NOT NULL, -- venda_id
  tipo            TEXT    NOT NULL, -- nfce | nfe | nfse
  status          TEXT    NOT NULL DEFAULT 'processando', -- processando | autorizada | rejeitada | cancelada
  chave_acesso    TEXT,
  motivo_rejeicao TEXT,
  criado_em       TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_notas_fiscais_origem ON notas_fiscais (origem, origem_id);
