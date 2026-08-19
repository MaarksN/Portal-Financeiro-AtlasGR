// Extraido do inline <script> de login.html: o CSP do portal bloqueia
// script-src inline, entao precisa ser arquivo externo.
const form = document.getElementById("form-login");
const erroEl = document.getElementById("erro-login");
const btn = document.getElementById("btn-entrar");

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  erroEl.classList.add("oculto");
  btn.disabled = true;
  btn.textContent = "Entrando...";
  try {
    const res = await fetch("api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usuario: document.getElementById("usuario").value.trim(),
        senha: document.getElementById("senha").value,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Falha ao entrar.");
    window.location.href = "index.html";
  } catch (err) {
    erroEl.textContent = err.message;
    erroEl.classList.remove("oculto");
    btn.disabled = false;
    btn.textContent = "Entrar";
  }
});

// Se ja existe sessao valida, pula direto pro painel.
fetch("api/me").then((r) => r.json()).then((data) => {
  if (data.autenticado) window.location.href = "index.html";
}).catch(() => {});
