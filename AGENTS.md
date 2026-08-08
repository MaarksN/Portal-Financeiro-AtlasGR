# Diretrizes do Agente - Portal-Financeiro-AtlasGR

## 1. Contexto do Projeto
- Portal Financeiro AtlasGR para conciliação bancária, fluxo de caixa, gestão de contas a pagar/receber e DRE.

## 2. Regras de Código & Governança Financeira
- Escreva código completo de nível de produção. NUNCA use comentários como `// TODO: implementar` ou omita trechos de código.
- Stack: Node.js (`server.js`), Express, JavaScript/HTML5, SQLite/Postgres.
- NUNCA modifique fórmulas financeiras (DRE, Margem EBITDA, Saldo de Caixa) sem autorização explícita.
- Todos os lançamentos financeiros devem ter validação de data, categoria e status de liquidação.
- Garanta que erros de conexão com o banco de dados sejam registrados em `server.log` com timestamps.

## 3. Segurança & Auditoria
- Não insira dados bancários reais em arquivos de teste (`dados/` ou `tests/`).
- Utilize `.env` para portas e parâmetros de configuração do servidor.
