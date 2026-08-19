// Autenticacao simples por sessao (cookie assinado), sem dependencias novas.
// Usa apenas o modulo "crypto" nativo do Node (HMAC-SHA256) para assinar um
// token { usuario, expira } guardado num cookie httpOnly.
//
// Nao e um sistema de contas multiplas - existe 1 usuario administrador
// definido via ADMIN_USER/ADMIN_PASSWORD no .env, o suficiente para proteger
// o painel financeiro de acesso publico.

const crypto = require("crypto");
const config = require("./config");

const COOKIE_NAME = "atlas_session";
const SESSION_HOURS = 12;

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(payloadB64) {
  return crypto.createHmac("sha256", config.auth.sessionSecret).update(payloadB64).digest("base64url");
}

function createToken(username) {
  const payload = JSON.stringify({ u: username, exp: Date.now() + SESSION_HOURS * 3600 * 1000 });
  const payloadB64 = base64url(payload);
  return `${payloadB64}.${sign(payloadB64)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [payloadB64, signature] = token.split(".");
  const expected = sign(payloadB64);
  const a = Buffer.from(signature || "");
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload.u;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

function currentUser(req) {
  const cookies = parseCookies(req);
  return verifyToken(cookies[COOKIE_NAME]);
}

function checkCredentials(username, password) {
  if (!config.auth.user || !config.auth.password) return false;
  const userOk = safeEqualString(username || "", config.auth.user);
  const passOk = safeEqualString(password || "", config.auth.password);
  return userOk && passOk;
}

function safeEqualString(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // ainda compara para nao vazar timing pelo tamanho de forma grosseira
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${SESSION_HOURS * 3600}; SameSite=Lax${secure}`
  );
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

/** Middleware para rotas de API (JSON): responde 401 se nao autenticado. */
function requireAuthApi(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ ok: false, error: "Sessao expirada ou nao autenticada." });
  req.user = user;
  next();
}

/** Middleware para paginas HTML: redireciona para /login.html se nao autenticado. */
function requireAuthPage(req, res, next) {
  const user = currentUser(req);
  // req.baseUrl e o prefixo de montagem quando este server e usado como
  // sub-app (ex.: "/integracao"); fica vazio quando roda como app raiz.
  if (!user) return res.redirect(`${req.baseUrl}/login.html`);
  req.user = user;
  next();
}

module.exports = {
  COOKIE_NAME,
  createToken,
  verifyToken,
  currentUser,
  checkCredentials,
  setSessionCookie,
  clearSessionCookie,
  requireAuthApi,
  requireAuthPage,
};
