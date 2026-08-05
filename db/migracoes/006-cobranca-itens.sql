-- ------------------------------------------------------------------
-- Migração 006 — Itens de cobrança
--
-- Detalhamento por veículo de uma cobrança (o "informativo" que
-- acompanha o boleto): placa, transportador, mês de referência e
-- valor. Uma cobrança pode não ter itens (import de fonte que não
-- manda detalhamento) — por isso não é obrigatório.
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cobranca_itens (
  id             INTEGER PRIMARY KEY,
  cobranca_id    INTEGER NOT NULL REFERENCES cobrancas (id) ON DELETE CASCADE,
  placa          TEXT    NOT NULL,
  transportador  TEXT,
  mes_referencia TEXT,
  valor_centavos INTEGER NOT NULL,
  criado_em      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_cobranca_itens_cobranca ON cobranca_itens (cobranca_id);
