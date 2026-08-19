// Aplica o tema salvo (ou o do sistema operacional) antes da primeira
// pintura, pra nao piscar claro->escuro ao carregar. Precisa ser um
// arquivo externo (nao inline) porque o CSP do portal bloqueia scripts
// inline (script-src 'self').
(function () {
  try {
    var salvo = localStorage.getItem("atlas-fin-tema");
    var tema = salvo || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro");
    document.documentElement.setAttribute("data-tema", tema);
  } catch (e) {
    document.documentElement.setAttribute("data-tema", "claro");
  }
})();
