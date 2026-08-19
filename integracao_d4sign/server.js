const path = require("path");
const express = require("express");
const config = require("./config");
const logger = require("./logger");
const auth = require("./auth");
const bitrixWebhookRoutes = require("./routes/bitrixWebhook");
const d4signWebhookRoutes = require("./routes/d4signWebhook");
const { runMonthlyBilling } = require("./services/billingService");
const { generateAndSendContract } = require("./services/contractService");
const { computeAlerts } = require("./services/alertService");
const { buildCarteira, buildKpis } = require("./services/kpiService");

const app = express();

app.use(express.json());
// Fallback para eventuais integracoes que enviem x-www-form-urlencoded.
// O webhook da D4Sign especificamente e multipart/form-data e e' tratado
// pelo middleware multer dentro de routes/d4signWebhook.js.
app.use(express.urlencoded({ extended: true }));

// Serve os arquivos estaticos (css/js/imagens/login.html), mas SEM o
// mapeamento automatico "/" -> index.html: o painel (index.html) contem
// dados financeiros e so pode ser entregue depois de checar a sessao
// (ver rota GET "/" abaixo).
app.use(express.static(path.join(__dirname, "public"), { index: false }));

app.get("/health", (req, res) => res.status(200).send("ok"));

// ---------------------------------------------------------------------
// Autenticacao do painel (sessao via cookie assinado - ver src/auth.js)
// ---------------------------------------------------------------------
app.post("/api/login", (req, res) => {
  const { usuario, senha } = req.body || {};
  if (!config.auth.password) {
    return res.status(500).json({ ok: false, error: "ADMIN_PASSWORD nao configurada no servidor." });
  }
  if (!auth.checkCredentials(usuario, senha)) {
    return res.status(401).json({ ok: false, error: "Usuario ou senha invalidos." });
  }
  auth.setSessionCookie(res, auth.createToken(usuario));
  res.json({ ok: true, usuario });
});

app.post("/api/logout", (req, res) => {
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const user = auth.currentUser(req);
  res.json({ ok: true, autenticado: Boolean(user), usuario: user || null });
});

app.get(["/", "/index.html"], auth.requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Dispara a rotina mensal de cobranca (NXFacil) sob demanda - variante
// protegida por segredo (para chamadas externas, sem sessao de login).
// Fica ANTES do middleware de sessao abaixo de proposito.
app.post("/api/executar-cobranca-mensal", async (req, res) => {
  const secret = req.headers["x-webhook-secret"] || req.query.secret;
  if (secret !== config.internalWebhookSecret) {
    return res.status(401).json({ ok: false, error: "Segredo invalido." });
  }
  try {
    const summary = await runMonthlyBilling();
    res.json({ ok: true, summary });
  } catch (err) {
    logger.error("Falha ao executar cobranca mensal via painel:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Todo o resto de /api/* exige sessao valida.
app.use("/api", auth.requireAuthApi);

// Status resumido para o painel HTML. Nunca devolve segredos/tokens,
// apenas se cada integracao esta configurada ou nao.
app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    porta: config.port,
    bitrix: { configurado: Boolean(config.bitrix.webhookUrl) },
    d4sign: {
      configurado: Boolean(config.d4sign.tokenApi && config.d4sign.cryptKey),
      baseUrl: config.d4sign.baseUrl,
    },
    nxfacil: { modo: config.nxfacil.mode },
    banco: { tipo: config.databaseUrl ? "postgres" : "arquivo local (data/mapping.json)" },
  });
});

app.get("/api/carteira", async (req, res) => {
  try {
    res.json({ ok: true, carteira: await buildCarteira() });
  } catch (err) {
    logger.error("Falha ao montar carteira:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/kpis", async (req, res) => {
  try {
    res.json({ ok: true, kpis: await buildKpis() });
  } catch (err) {
    logger.error("Falha ao montar KPIs:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/alertas", async (req, res) => {
  try {
    res.json({ ok: true, alertas: await computeAlerts() });
  } catch (err) {
    logger.error("Falha ao calcular alertas:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Acoes manuais do painel, agora protegidas pela sessao de login (nao
// precisa mais colar o INTERNAL_WEBHOOK_SECRET na tela).
app.post("/api/acoes/gerar-contrato", async (req, res) => {
  const dealId = req.body?.dealId;
  if (!dealId) return res.status(400).json({ ok: false, error: "dealId nao informado." });
  try {
    const result = await generateAndSendContract(dealId);
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error(`Falha ao gerar contrato para o deal ${dealId}:`, err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/acoes/rodar-cobranca", async (req, res) => {
  try {
    const summary = await runMonthlyBilling();
    res.json({ ok: true, summary });
  } catch (err) {
    logger.error("Falha ao executar cobranca mensal via painel:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.use("/webhooks/bitrix", bitrixWebhookRoutes);
app.use("/webhooks/d4sign", d4signWebhookRoutes);

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  logger.error("Erro nao tratado:", err);
  res.status(500).json({ ok: false, error: "Erro interno" });
});

module.exports = app;
