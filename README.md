# Central Atlas GR

Uma central interna para dois processos que hoje vivem espalhados:
reembolso com alçada de aprovação, e o funil de cobrança do
financeiro — consolidando a carteira que hoje está no Bitrix24, no
Connect Plus e no Perfil Securitário.

## Como cada módulo funciona

### Reembolso — relatório de despesa, não despesa solta

O funcionário agrupa os gastos de uma viagem/período num **relatório**,
lança as despesas com comprovante em cada uma, e envia uma vez só —
não uma aprovação por item.

- **Política** (`lib/politica.js`): teto por categoria (por item ou
  por dia), exige comprovante e/ou justificativa. Alertas não
  bloqueiam o lançamento — só o **comprovante ausente** trava o
  envio; o resto fica visível para quem aprova decidir.
- **Alçada em cadeia**: o relatório sobe por TODOS os níveis cujo teto
  é menor que o total (R$ 6.000 passa por coordenação → gerência →
  diretoria, nessa ordem). Configurável no `.env`.
- **Anexos**: em disco (`dados/anexos`), nome gerado, metadados no
  banco, servidos por rota autenticada — nunca por caminho estático.
- Ao aprovar totalmente, dispara `reembolso.aprovado` pro serviço de
  integração existente (mesmo contrato HMAC de sempre); o financeiro
  dá baixa em `reembolso.pago`.

### Cobranças — o funil é do financeiro, não da origem

Cada fatura é normalizada de uma ou mais fontes (Bitrix24, Connect
Plus, Perfil Securitário, importação CSV) para uma tabela única. A
origem manda nos **dados financeiros** (valor, vencimento, pagamento);
o **estágio no funil** é propriedade do portal:

```
A vencer → Vencida → Contato feito → Em negociação → Promessa de
pagamento → Acordo/parcelado → Jurídico → Paga / Perda
```

- Arrastar um cartão move o estágio; mover para "Promessa" exige data,
  mover para "Jurídico" ou "Perda" exige justificativa.
- Toda mudança e todo contato registrado (ligação, e-mail, WhatsApp,
  reunião) vira linha na **régua de cobrança** — histórico completo
  por fatura.
- Painel com aging (1-30/31-60/61-90/90+), DSO, taxa de recuperação,
  promessas quebradas, agenda do dia e maiores devedores.
- Sincronizar de novo nunca apaga o trabalho manual: se a origem
  reporta pagamento, o funil segue; fora isso, estágio/responsável são
  preservados.

## Fontes de cobrança conectadas

| Fonte | Como conecta | Configuração |
|---|---|---|
| Bitrix24 | `crm.item.list` direto (leitura) | `BITRIX_WEBHOOK` + `ENTITY_TYPE_ID_COBRANCA` |
| Connect Plus | REST próprio | `CONNECT_BASE` + `CONNECT_TOKEN` |
| Perfil Securitário | REST próprio | `PERFIL_BASE` + `PERFIL_TOKEN` |
| CSV | Upload manual na tela Fontes | nenhuma — sempre disponível |

Connect Plus e Perfil Securitário são sistemas internos da Atlas sem
documentação de API pública consultada aqui — o conector
(`lib/conectores/rest-generico.js`) é tolerante a formato: aceita o
array de faturas na raiz da resposta ou embrulhado, e reconhece os
nomes de campo mais prováveis em português e inglês. Se os nomes reais
forem outros, ajuste a lista de candidatos nesse arquivo — nada mais
no portal precisa mudar. **Sem endpoint de API, a importação por CSV
funciona hoje**, sem nenhuma configuração.

## Modo demonstração

Sem nenhuma fonte configurada no `.env`, o portal detecta e sobe
sozinho com dados semeados: 8 usuários, 34 faturas de exemplo
espalhadas pelo funil e 4 relatórios de reembolso. Um aviso amarelo
aparece no topo da central enquanto isso for verdade.

```
financeiro@atlasgr.com.br    — cobranças, dá baixa em reembolso
coordenacao@atlasgr.com.br   — aprova (1º nível de alçada)
gerencia@atlasgr.com.br      — aprova (2º nível)
diretoria@atlasgr.com.br     — aprova (3º nível)
comercial@atlasgr.com.br     — solicitante
ti@atlasgr.com.br            — fontes e integrações
rh@atlasgr.com.br            — solicitante + coordenação
admin@atlasgr.com.br         — todos os papéis
```
Senha para todos: `atlas123`.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Abre em `http://localhost:3000`. Sem editar o `.env`, já funciona em
modo demonstração — veja as credenciais acima.

Para usar as integrações reais, preencha no `.env` só o que for usar
(Bitrix, Connect Plus, Perfil Securitário são todos independentes
entre si) — detalhes de cada variável estão comentados no próprio
`.env.example`.

## Segurança

- **Sessão real**: `express-session` com store em SQLite (sobrevive a
  restart), cookie `httpOnly`, `secure` em produção, `SESSION_SECRET`
  obrigatório fora de desenvolvimento.
- **CSRF**: token sincronizador por sessão, exigido em todo método que
  não seja leitura.
- **RBAC por papel**: `solicitante`, `coordenacao`, `gerencia`,
  `diretoria`, `financeiro`, `ti`, `admin` — cada rota de escrita
  declara quem pode chamá-la (`lib/seguranca.js`).
- **Rate limit**: login (20/10min por IP) e API (300/min por IP).
- **CSP, helmet**, upload com lista branca de tipo/tamanho, download
  de comprovante por rota autenticada.
- **Trilha de auditoria**: toda ação relevante (login, decisão de
  aprovação, mudança de estágio) grava em `auditoria`, consultável por
  entidade.

## O que ainda falta para produção

- **Trocar os usuários de demonstração** por SSO da empresa (Google
  Workspace / Microsoft Entra) — só `lib/usuarios.js` muda.
- **Preencher as credenciais reais** de Bitrix, Connect Plus e Perfil
  Securitário no `.env` de produção.
- **Confirmar os nomes dos campos customizados** do Bitrix
  (`BITRIX_CAMPO_*`) e, se necessário, ajustar os candidatos de nome
  em `lib/conectores/rest-generico.js` para Connect Plus/Perfil
  Securitário depois de ver uma resposta real da API deles.
- **`SESSION_SECRET`** forte e fixo em produção (`NODE_ENV=production`
  já exige isso no boot).
- Trocar `ATLAS_DADOS`/backup do SQLite por um volume persistente (ou
  migrar para Postgres — o código de domínio não muda, só `db/`).

## Estrutura

```
config.js                    → leitura tipada do .env, detecção de modo demo
server.js                    → bootstrap: sessão, segurança, rotas, job de sincronização

db/
  migracoes/001-inicial.sql  → schema
  index.js                   → conexão SQLite, migração, helpers
  seed.js                    → usuários, política e dados de demonstração

lib/
  erros.js, log.js, http.js  → infraestrutura comum (erro tipado, logger, fetch c/ retry)
  seguranca.js                → CSRF, RBAC, rate limit, helmet
  sessao-store.js             → sessão em SQLite
  usuarios.js, auditoria.js   → contas, papéis, trilha de auditoria
  dinheiro.js                 → conversão reais ↔ centavos

  integracao.js               → contrato HMAC com o serviço de integração existente
  espelho.js                  → fila de espelhamento para o Bitrix

  politica.js, anexos.js      → política de despesa, comprovantes
  reembolsos.js                → relatórios, despesas, cadeia de alçada

  funil.js                    → estágios e regras de transição do funil
  cobrancas.js                → domínio de cobranças (funil, aging, KPIs, régua)
  bitrix.js                   → leitura direta do Bitrix (crm.item.list)
  conectores/                 → adaptadores por fonte (bitrix, REST genérico, CSV) + upsert

rotas/                        → API HTTP, um arquivo por domínio

public/
  index.html, login.html      → páginas públicas
  portal.html                 → casca da central (SPA sem framework)
  styles.css                  → sistema visual (identidade Atlas + padrão NewConnect)
  js/
    nucleo/api.js, ui.js      → acesso à API, componentes de UI
    telas/                    → uma tela por módulo (início, reembolsos,
                                 aprovações, cobranças, fontes)
```
