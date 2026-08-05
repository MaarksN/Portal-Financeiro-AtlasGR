-- ------------------------------------------------------------------
-- Migração 004 — Remove o módulo de Chamados
--
-- O portal deixou de espelhar chamados do Jira; ficam só Financeiro
-- e Reembolso. A fila do espelho (espelho_fila) continua existindo —
-- é usada pelos reembolsos.
-- ------------------------------------------------------------------

DROP INDEX IF EXISTS ix_chamados_solicitante;
DROP INDEX IF EXISTS ix_chamados_status;
DROP TABLE IF EXISTS chamados;
