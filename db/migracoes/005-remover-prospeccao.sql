-- ------------------------------------------------------------------
-- Migração 005 — Remove o módulo de Prospecção (Apollo)
--
-- A plataforma passa a ser só de cunho financeiro: financeiro e
-- reembolso. A tabela de leads/telefones da Apollo não é mais usada.
-- ------------------------------------------------------------------

DROP INDEX IF EXISTS ix_prospeccao_leads_request;
DROP TABLE IF EXISTS prospeccao_leads;
