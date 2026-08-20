# Diretrizes do Agente - Portal-Financeiro-AtlasGR

## 1. Contexto do Projeto
- Portal Financeiro AtlasGR para conciliação bancária, fluxo de caixa, gestão de contas a pagar/receber, DRE, contratos e integrações (Bitrix24, D4Sign, NXFácil).

## 2. Regras de Código & Governança Financeira
- Escreva código completo de nível de produção. NUNCA use comentários como `// TODO: implementar` ou omita trechos de código.
- Stack: Node.js (`server.js`), Express, JavaScript/HTML5, SQLite (better-sqlite3).
- NUNCA modifique fórmulas financeiras (DRE, Margem EBITDA, Saldo de Caixa) sem autorização explícita.
- Todos os lançamentos financeiros devem ter validação de data, categoria e status de liquidação.
- Valores monetários SEMPRE em centavos (inteiro), nunca ponto flutuante.
- Garanta que erros sejam registrados com timestamps.

## 3. Segurança & Auditoria
- Não insira dados bancários reais em arquivos de teste.
- Utilize `.env` para configuração. Nunca exponha secrets em logs.
