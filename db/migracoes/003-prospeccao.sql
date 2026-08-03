-- ------------------------------------------------------------------
-- Migração 003 — Prospecção (Apollo)
--
-- A busca de pessoas na Apollo não devolve telefone (é de graça, sem
-- crédito). Para revelar o telefone de um lead específico é preciso
-- pedir enriquecimento à parte, que consome crédito pago e responde
-- de forma assíncrona: a Apollo confirma o pedido na hora e entrega o
-- número depois, num webhook nosso. Esta tabela existe pra guardar
-- esse "depois" — cada linha é um pedido de telefone em andamento ou
-- concluído, correlacionado pelo `apollo_request_id` que a Apollo usa
-- pra saber de qual pedido é a resposta.
-- ------------------------------------------------------------------

CREATE TABLE prospeccao_leads (
  id                    INTEGER PRIMARY KEY,
  apollo_id             TEXT    NOT NULL UNIQUE,
  apollo_request_id     TEXT,
  nome                  TEXT,
  cargo                 TEXT,
  empresa               TEXT,
  telefone_status       TEXT    NOT NULL DEFAULT 'pendente',  -- pendente | recebido | falhou
  telefone_e164         TEXT,
  telefone_bruto        TEXT,
  telefone_tipo         TEXT,                                 -- mobile | work_direct | ...
  solicitado_por_email  TEXT,
  solicitado_em         TEXT,
  recebido_em           TEXT,
  criado_em             TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em         TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_prospeccao_leads_request ON prospeccao_leads (apollo_request_id);

-- Base já provisionada: garante o papel comercial no usuário de
-- demonstração sem depender de reseed (db/seed.js só semeia tabela
-- vazia).
UPDATE usuarios
   SET papeis = '["solicitante","comercial"]'
 WHERE email = 'comercial@atlasgr.com.br'
   AND papeis NOT LIKE '%comercial%';
