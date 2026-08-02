-- ------------------------------------------------------------------
-- Schema inicial da central Atlas.
--
-- Convenções:
--   * dinheiro sempre em CENTAVOS (INTEGER) — nada de float em valor;
--   * datas em texto ISO 8601 (UTC para carimbos, YYYY-MM-DD para datas
--     de calendário como vencimento e data da despesa);
--   * campos que guardam lista/objeto vão como JSON em TEXT.
-- ------------------------------------------------------------------

-- ============================== Pessoas ==============================

CREATE TABLE usuarios (
  id                INTEGER PRIMARY KEY,
  email             TEXT    NOT NULL UNIQUE,
  nome              TEXT    NOT NULL,
  senha_hash        TEXT    NOT NULL,
  papeis            TEXT    NOT NULL DEFAULT '[]',   -- JSON: ["solicitante","gerencia"]
  centro_custo      TEXT,
  gestor_email      TEXT,
  ativo             INTEGER NOT NULL DEFAULT 1,
  tentativas_falhas INTEGER NOT NULL DEFAULT 0,
  bloqueado_ate     TEXT,
  ultimo_acesso_em  TEXT,
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessoes (
  sid       TEXT    PRIMARY KEY,
  dados     TEXT    NOT NULL,
  expira_em INTEGER NOT NULL
);
CREATE INDEX ix_sessoes_expira ON sessoes (expira_em);

-- ============================== Chamados ==============================
-- O Jira é dono do ciclo de vida. Esta tabela é um espelho de leitura
-- (pra listar rápido, filtrar e não bater na API a cada tela) mais a
-- ponte com o card do Bitrix.

CREATE TABLE chamados (
  id                INTEGER PRIMARY KEY,
  protocolo         TEXT    NOT NULL UNIQUE,
  chave_jira        TEXT    UNIQUE,
  id_jira           TEXT,
  url_jira          TEXT,
  solicitante_email TEXT    NOT NULL,
  categoria         TEXT    NOT NULL,
  prioridade        TEXT    NOT NULL,
  resumo            TEXT    NOT NULL,
  descricao         TEXT,
  status            TEXT    NOT NULL DEFAULT 'Enviado',
  status_categoria  TEXT,                              -- todo | andamento | concluido
  responsavel       TEXT,
  sla_vence_em      TEXT,
  sla_violado       INTEGER NOT NULL DEFAULT 0,
  id_bitrix         TEXT,                              -- id do card espelhado
  sincronizado_em   TEXT,
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_chamados_solicitante ON chamados (solicitante_email);
CREATE INDEX ix_chamados_status      ON chamados (status_categoria);

-- Fila do espelho Jira -> Bitrix. Persistida para sobreviver a
-- reinício: se o serviço de integração estiver fora, o evento espera
-- aqui e é reenviado com backoff. `chave_idem` é a mesma chave de
-- idempotência que o serviço já usa hoje com o ERP.
CREATE TABLE espelho_fila (
  id                   INTEGER PRIMARY KEY,
  chave_idem           TEXT    NOT NULL UNIQUE,
  evento               TEXT    NOT NULL,
  dados                TEXT    NOT NULL,               -- JSON
  estado               TEXT    NOT NULL DEFAULT 'pendente',  -- pendente | enviado | falhou
  tentativas           INTEGER NOT NULL DEFAULT 0,
  proxima_tentativa_em TEXT,
  ultimo_erro          TEXT,
  criado_em            TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_espelho_pendente ON espelho_fila (estado, proxima_tentativa_em);

-- ============================== Reembolso ==============================
-- Um relatório de despesa agrupa N despesas. É o relatório que sobe a
-- cadeia de alçada, não a despesa solta — é assim que os produtos de
-- mercado fazem e é o que evita 40 aprovações para uma única viagem.

CREATE TABLE relatorios (
  id                      INTEGER PRIMARY KEY,
  protocolo               TEXT    NOT NULL UNIQUE,
  titulo                  TEXT    NOT NULL,
  solicitante_email       TEXT    NOT NULL,
  centro_custo            TEXT,
  periodo_inicio          TEXT,
  periodo_fim             TEXT,
  estado                  TEXT    NOT NULL DEFAULT 'rascunho',
    -- rascunho | enviado | em_aprovacao | aprovado | pago | rejeitado | devolvido
  total_centavos          INTEGER NOT NULL DEFAULT 0,
  total_aprovado_centavos INTEGER NOT NULL DEFAULT 0,
  nivel_atual             TEXT,
  enviado_em              TEXT,
  decidido_em             TEXT,
  pago_em                 TEXT,
  id_bitrix               TEXT,
  criado_em               TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em           TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_relatorios_solicitante ON relatorios (solicitante_email);
CREATE INDEX ix_relatorios_estado      ON relatorios (estado);

CREATE TABLE despesas (
  id             INTEGER PRIMARY KEY,
  relatorio_id   INTEGER NOT NULL REFERENCES relatorios (id) ON DELETE CASCADE,
  data           TEXT    NOT NULL,                    -- YYYY-MM-DD
  categoria      TEXT    NOT NULL,
  descricao      TEXT,
  fornecedor     TEXT,
  projeto        TEXT,
  valor_centavos INTEGER NOT NULL,
  justificativa  TEXT,
  alertas        TEXT    NOT NULL DEFAULT '[]',       -- JSON: violações de política
  criado_em      TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_despesas_relatorio ON despesas (relatorio_id);

CREATE TABLE anexos (
  id            INTEGER PRIMARY KEY,
  relatorio_id  INTEGER REFERENCES relatorios (id) ON DELETE CASCADE,
  despesa_id    INTEGER REFERENCES despesas (id)   ON DELETE CASCADE,
  nome_original TEXT    NOT NULL,
  nome_arquivo  TEXT    NOT NULL UNIQUE,             -- nome gerado em disco
  tipo          TEXT    NOT NULL,
  tamanho       INTEGER NOT NULL,
  hash_sha256   TEXT,
  enviado_por   TEXT    NOT NULL,
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_anexos_despesa   ON anexos (despesa_id);
CREATE INDEX ix_anexos_relatorio ON anexos (relatorio_id);

-- Cadeia de alçada montada no envio. Uma linha por nível exigido.
CREATE TABLE aprovacoes (
  id            INTEGER PRIMARY KEY,
  relatorio_id  INTEGER NOT NULL REFERENCES relatorios (id) ON DELETE CASCADE,
  nivel         TEXT    NOT NULL,                    -- coordenacao | gerencia | diretoria
  rotulo        TEXT    NOT NULL,
  ordem         INTEGER NOT NULL,
  estado        TEXT    NOT NULL DEFAULT 'pendente', -- pendente | aprovado | rejeitado | devolvido
  decisor_email TEXT,
  comentario    TEXT,
  decidido_em   TEXT,
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_aprovacoes_relatorio ON aprovacoes (relatorio_id, ordem);
CREATE INDEX ix_aprovacoes_fila      ON aprovacoes (estado, nivel);

-- Teto por categoria. Sobrepõe o padrão de fábrica do config.js.
CREATE TABLE politica_categorias (
  categoria           TEXT    PRIMARY KEY,
  teto_centavos       INTEGER,                        -- NULL = sem teto
  teto_por            TEXT    NOT NULL DEFAULT 'item',-- item | dia
  exige_comprovante   INTEGER NOT NULL DEFAULT 1,
  exige_justificativa INTEGER NOT NULL DEFAULT 0,
  ativo               INTEGER NOT NULL DEFAULT 1
);

-- ============================== Cobranças ==============================
-- Normalizadas de várias origens (Bitrix, Connect Plus, Perfil
-- Securitário, CSV). A origem manda nos dados financeiros; o ESTÁGIO
-- DO FUNIL é propriedade do portal — é o que o financeiro controla
-- sem depender de escrita de volta nos sistemas legados.

CREATE TABLE cobrancas (
  id                   INTEGER PRIMARY KEY,
  origem               TEXT    NOT NULL,              -- bitrix | connect | perfil | csv | demo
  id_externo           TEXT    NOT NULL,
  documento            TEXT,
  cliente_nome         TEXT    NOT NULL,
  cliente_doc          TEXT,
  cliente_id_externo   TEXT,
  valor_centavos       INTEGER NOT NULL,
  valor_pago_centavos  INTEGER NOT NULL DEFAULT 0,
  emissao              TEXT,
  vencimento           TEXT    NOT NULL,              -- YYYY-MM-DD
  pagamento            TEXT,
  estagio              TEXT    NOT NULL DEFAULT 'a_vencer',
  responsavel_email    TEXT,
  proxima_acao         TEXT,
  proxima_acao_em      TEXT,
  promessa_em          TEXT,
  promessa_quebrada    INTEGER NOT NULL DEFAULT 0,
  observacao           TEXT,
  status_origem        TEXT,
  url_origem           TEXT,
  sincronizado_em      TEXT,
  criado_em            TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em        TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (origem, id_externo)
);
CREATE INDEX ix_cobrancas_estagio    ON cobrancas (estagio);
CREATE INDEX ix_cobrancas_vencimento ON cobrancas (vencimento);
CREATE INDEX ix_cobrancas_cliente    ON cobrancas (cliente_nome);

-- Régua de cobrança: todo contato e toda mudança de estágio viram
-- linha aqui. É o histórico que o financeiro lê antes de ligar.
CREATE TABLE interacoes (
  id           INTEGER PRIMARY KEY,
  cobranca_id  INTEGER NOT NULL REFERENCES cobrancas (id) ON DELETE CASCADE,
  tipo         TEXT    NOT NULL,   -- ligacao | email | whatsapp | reuniao | nota | estagio | promessa
  resumo       TEXT    NOT NULL,
  de_estagio   TEXT,
  para_estagio TEXT,
  autor_email  TEXT    NOT NULL,
  criado_em    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_interacoes_cobranca ON interacoes (cobranca_id, criado_em);

-- ============================== Plataforma ==============================

CREATE TABLE auditoria (
  id          INTEGER PRIMARY KEY,
  ator_email  TEXT,
  acao        TEXT    NOT NULL,
  entidade    TEXT    NOT NULL,
  entidade_id TEXT,
  detalhe     TEXT,                                   -- JSON
  ip          TEXT,
  criado_em   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_auditoria_entidade ON auditoria (entidade, entidade_id);
CREATE INDEX ix_auditoria_momento  ON auditoria (criado_em);

CREATE TABLE sincronizacoes (
  id           INTEGER PRIMARY KEY,
  fonte        TEXT    NOT NULL,
  estado       TEXT    NOT NULL,                      -- rodando | ok | erro
  registros    INTEGER NOT NULL DEFAULT 0,
  novos        INTEGER NOT NULL DEFAULT 0,
  atualizados  INTEGER NOT NULL DEFAULT 0,
  erro         TEXT,
  iniciado_em  TEXT    NOT NULL DEFAULT (datetime('now')),
  terminado_em TEXT
);
CREATE INDEX ix_sincronizacoes_fonte ON sincronizacoes (fonte, iniciado_em);
