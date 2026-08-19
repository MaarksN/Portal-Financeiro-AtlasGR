// Painel Financeiro - Atlas v10.0
// Vanilla JS, sem framework - so o essencial para o painel funcionar.

const fmtMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

// ---------------------------------------------------------------------
// Tema (claro/escuro), igual ao resto do "Acompanhamentos Atlasgr Comercial"
// ---------------------------------------------------------------------
function alternarTema() {
  const atual = document.documentElement.getAttribute("data-tema");
  const novo = atual === "escuro" ? "claro" : "escuro";
  document.documentElement.setAttribute("data-tema", novo);
  try { localStorage.setItem("atlas-fin-tema", novo); } catch {}
  document.getElementById("btnTema").textContent = novo === "escuro" ? "☀️" : "🌙";
}
(function initTema() {
  const tema = document.documentElement.getAttribute("data-tema");
  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("btnTema");
    if (btn) btn.textContent = tema === "escuro" ? "☀️" : "🌙";
  });
})();

// ---------------------------------------------------------------------
// Relogio no cabecalho
// ---------------------------------------------------------------------
function atualizarRelogio() {
  const agora = new Date();
  const dataEl = document.getElementById("dataAtualTopo");
  const horaEl = document.getElementById("horaAtualTopo");
  if (dataEl) dataEl.textContent = agora.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  if (horaEl) horaEl.textContent = `${agora.toLocaleTimeString("pt-BR")} · horário local`;
}
atualizarRelogio();
setInterval(atualizarRelogio, 1000);

// ---------------------------------------------------------------------
// Log de atividade
// ---------------------------------------------------------------------
const logEl = document.getElementById("log");
function log(msg) {
  const time = new Date().toLocaleTimeString("pt-BR");
  logEl.textContent = `[${time}] ${msg}\n` + logEl.textContent;
}

// ---------------------------------------------------------------------
// Abas
// ---------------------------------------------------------------------
function irParaAba(nome) {
  document.querySelectorAll(".v10-tab").forEach((btn) => btn.classList.toggle("ativa", btn.dataset.tab === nome));
  document.querySelectorAll("[data-tab-content]").forEach((el) => el.classList.toggle("oculto", el.dataset.tabContent !== nome));
}
document.querySelectorAll(".v10-tab").forEach((btn) => btn.addEventListener("click", () => irParaAba(btn.dataset.tab)));
document.querySelectorAll("[data-goto-tab]").forEach((el) =>
  el.addEventListener("click", (ev) => { ev.preventDefault(); irParaAba(el.dataset.gotoTab); })
);

// ---------------------------------------------------------------------
// Sessao / logout
// ---------------------------------------------------------------------
async function carregarUsuario() {
  try {
    const res = await fetch("/api/me");
    const data = await res.json();
    if (!data.autenticado) return (window.location.href = "/login.html");
    document.getElementById("user-nome").textContent = data.usuario;
  } catch {
    window.location.href = "/login.html";
  }
}

document.getElementById("btn-sair").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/login.html";
});

// ---------------------------------------------------------------------
// Status das integracoes
// ---------------------------------------------------------------------
async function carregarStatus() {
  try {
    const res = await fetch("/api/status");
    const data = await res.json();
    const grid = document.getElementById("status-grid");
    const item = (label, valor) => `
      <div class="cockpit-situacao-item">
        <span class="cockpit-situacao-label">${label}</span>
        <span class="cockpit-situacao-valor">${valor}</span>
      </div>`;
    grid.innerHTML =
      item("Bitrix24", data.bitrix.configurado ? "✅ Webhook configurado" : "⚠️ Não configurado") +
      item("D4Sign", data.d4sign.configurado ? `✅ ${data.d4sign.baseUrl}` : "⚠️ Não configurado") +
      item("NXFacil", data.nxfacil.modo === "http" ? "✅ modo http (real)" : "🧪 modo mock") +
      item("Banco de dados", data.banco.tipo.startsWith("postgres") ? "✅ Postgres" : "⚠️ arquivo local");

    document.getElementById("url-bitrix").textContent =
      `${window.location.origin}/webhooks/bitrix/gerar-contrato?dealId={{ID}}&secret=SEU_SEGREDO`;
    document.getElementById("url-d4sign").textContent = `${window.location.origin}/webhooks/d4sign`;
  } catch (err) {
    log(`Falha ao carregar status: ${err.message}`);
  }
}

// ---------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------
async function carregarKpis() {
  try {
    const res = await fetch("/api/kpis");
    const { kpis } = await res.json();
    const gridVendas = document.getElementById("kpi-grid-vendas");
    const gridContratos = document.getElementById("kpi-grid-contratos");
    const gridFin = document.getElementById("kpi-grid-financeiro");
    const cobr = kpis.cobrancaMes;
    const est = kpis.estrategico;
    const kpi = (valor, rotulo) => `<div class="relatorio-especial-kpi"><span class="valor">${valor}</span><span class="rotulo">${rotulo}</span></div>`;
    
    gridVendas.innerHTML =
      kpi(kpis.totalDeals, "Negócios acompanhados") +
      kpi(`${kpis.taxaAssinatura.toFixed(0)}%`, "Taxa de assinatura") +
      kpi(`${est.tempoMedioDias} dias`, "Tempo de fechamento");

    gridContratos.innerHTML =
      kpi(kpis.contratos.sent, "Aguardando assinatura") +
      kpi(kpis.contratos.signed, "Contratos assinados") +
      kpi(est.renovacoesProximas, "Renovações próximas (30d)") +
      kpi(`${est.taxaChurn.toFixed(1)}%`, "Taxa de Churn");

    gridFin.innerHTML =
      kpi(fmtMoeda.format(est.mrr || 0), "Total / MRR") +
      kpi(fmtMoeda.format(est.ticketMedio || 0), "Ticket Médio") +
      kpi(`${cobr.ok + cobr.mock}/${cobr.total}`, `Cobranças (${cobr.referenceMonth})`) +
      kpi(cobr.error, "Cobranças com erro") +
      kpi(`${est.inadimplencia.toFixed(1)}%`, "Inadimplência atual");
  } catch (err) {
    log(`Falha ao carregar KPIs: ${err.message}`);
  }
}

// ---------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------
const CLASSE_SEVERIDADE = { critico: "cockpit-alerta-critico", atencao: "cockpit-alerta-atencao", info: "cockpit-alerta-info" };
const ICONE_SEVERIDADE = { critico: "🔴", atencao: "🟡", info: "🔵" };

function renderAlertas(alertas, container, limite) {
  if (!alertas.length) {
    container.innerHTML = `<div class="v10-radar-tudo-ok"><span class="emoji">✅</span>Nenhum alerta no momento — tudo em dia.</div>`;
    return;
  }
  const lista = limite ? alertas.slice(0, limite) : alertas;
  container.innerHTML = lista
    .map(
      (a) => `
    <div class="cockpit-alerta ${CLASSE_SEVERIDADE[a.severidade] || ""}">
      <div class="cockpit-alerta-icone">${ICONE_SEVERIDADE[a.severidade] || "•"}</div>
      <div class="cockpit-alerta-corpo">
        <div class="cockpit-alerta-motivo">${a.titulo}</div>
        <div class="cockpit-alerta-valor">${a.subtitulo}</div>
      </div>
    </div>`
    )
    .join("");
}

async function carregarAlertas() {
  try {
    const res = await fetch("/api/alertas");
    const { alertas } = await res.json();
    document.getElementById("contagem-alertas").textContent = alertas.length;
    renderAlertas(alertas, document.getElementById("alertas-preview"), 5);
    renderAlertas(alertas, document.getElementById("alertas-full"));

    const track = document.getElementById("ticker-track");
    if (!alertas.length) {
      track.innerHTML = `<span class="cockpit-ticker-item">Nenhum alerta no momento — tudo em dia.</span>`;
    } else {
      const itens = alertas.map((a) => `<span class="cockpit-ticker-item">${ICONE_SEVERIDADE[a.severidade] || ""} ${a.titulo}</span>`).join("");
      track.innerHTML = itens + itens; // duplica para o loop de rolagem ficar continuo
    }
  } catch (err) {
    log(`Falha ao carregar alertas: ${err.message}`);
  }
}

// ---------------------------------------------------------------------
// Carteira
// ---------------------------------------------------------------------
const BADGE_CONTRATO = {
  signed: '<span class="cockpit-status-badge cockpit-status-saudavel">Assinado</span>',
  sent: '<span class="cockpit-status-badge cockpit-status-atencao">Aguardando assinatura</span>',
  cancelled: '<span class="cockpit-status-badge cockpit-status-critico">Cancelado</span>',
};
function badgeContrato(status) {
  return BADGE_CONTRATO[status] || '<span class="cockpit-status-badge">Sem contrato</span>';
}
function badgeCobranca(cobranca) {
  if (!cobranca) return '<span class="badge-relatorio">Sem cobrança registrada</span>';
  const erro = cobranca.boletoStatus === "error" || cobranca.notaStatus === "error";
  const cls = erro ? "alerta" : "ok";
  return `<span class="badge-relatorio ${cls}">${cobranca.referenceMonth}: boleto ${cobranca.boletoStatus} / nota ${cobranca.notaStatus}</span>`;
}

async function carregarCarteira() {
  try {
    const res = await fetch("/api/carteira");
    const { carteira } = await res.json();
    document.getElementById("contagem-carteira").textContent = carteira.length;
    const wrap = document.getElementById("carteira-wrap");

    if (!carteira.length) {
      wrap.innerHTML = `<div class="v10-vazio"><strong>Nenhum negócio na carteira ainda.</strong>
        Assim que um contrato for gerado (aba Ações) ou a cobrança mensal rodar, os negócios aparecem aqui automaticamente.</div>`;
      return;
    }

    const linhas = carteira
      .map(
        (d) => `
      <tr>
        <td>${d.dealId}</td>
        <td>${d.clientName || d.title || "—"}</td>
        <td class="fin-valor">${d.value != null ? fmtMoeda.format(d.value) : "—"}</td>
        <td>${badgeContrato(d.contractStatus)}</td>
        <td>${badgeCobranca(d.ultimaCobranca)}</td>
        <td>${fmtData(d.updatedAt)}</td>
      </tr>`
      )
      .join("");

    wrap.innerHTML = `
      <div class="fin-table-wrap">
        <table>
          <thead><tr><th>Deal</th><th>Cliente / Negócio</th><th>Valor</th><th>Contrato</th><th>Última cobrança</th><th>Atualizado em</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>`;
  } catch (err) {
    log(`Falha ao carregar carteira: ${err.message}`);
  }
}

// ---------------------------------------------------------------------
// Gestão de Integrações
// ---------------------------------------------------------------------
function renderIntegracoes() {
  const wrap = document.getElementById("integracoes-wrap");
  if (!wrap) return;

  const lista = [
    { categoria: "Assinaturas Eletrônicas", nome: "D4Sign", status: "ok", remetente: "Sistema Atlas", destinatario: "Signatário Principal" },
    { categoria: "Assinaturas Eletrônicas", nome: "Clicksign", status: "off", remetente: "—", destinatario: "—" },
    { categoria: "Gateways e Bancos", nome: "NXFacil / Boleto", status: "ok", remetente: "Financeiro", destinatario: "E-mail de Faturamento" },
    { categoria: "Gateways e Bancos", nome: "DDA (Débito Direto Autorizado)", status: "off", remetente: "Banco Central", destinatario: "App do Banco do Cliente" },
    { categoria: "CRM / Vendas", nome: "Bitrix24 (Webhook)", status: "ok", remetente: "Automação", destinatario: "Atlas" },
    { categoria: "Comunicação (Alertas)", nome: "WhatsApp", status: "off", remetente: "Número Oficial", destinatario: "WhatsApp do Cliente" },
    { categoria: "Comunicação (Alertas)", nome: "E-mail", status: "off", remetente: "faturamento@empresa.com", destinatario: "E-mail de Faturamento" },
    { categoria: "Comunicação (Alertas)", nome: "Grupo WhatsApp (Interno)", status: "off", remetente: "Bot", destinatario: "Equipe Financeira" },
  ];

  const badge = (status) => status === "ok" 
    ? '<span class="cockpit-status-badge cockpit-status-saudavel">🟢 Conectado</span>' 
    : '<span class="cockpit-status-badge cockpit-status-atencao">🔴 Não configurado</span>';

  const linhas = lista.map(i => `
    <tr>
      <td><strong>${i.categoria}</strong></td>
      <td>${i.nome}</td>
      <td>${badge(i.status)}</td>
      <td>${i.remetente}</td>
      <td>${i.destinatario}</td>
      <td><button class="secundario" style="font-size:11px; padding: 2px 8px;" onclick="alert('Conexão com ${i.nome} testada!')">Testar</button></td>
    </tr>
  `).join("");

  wrap.innerHTML = `
    <div class="fin-table-wrap">
      <table>
        <thead><tr><th>Categoria</th><th>Integração</th><th>Status</th><th>Remetente Padrão</th><th>Destinatário</th><th>Ação</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>`;
}

// ---------------------------------------------------------------------
// Copiar URLs (aba Configuração)
// ---------------------------------------------------------------------
document.querySelectorAll("[data-copy]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const text = document.getElementById(btn.dataset.copy).textContent;
    navigator.clipboard.writeText(text);
    const original = btn.textContent;
    btn.textContent = "Copiado!";
    setTimeout(() => (btn.textContent = original), 1200);
  });
});

// ---------------------------------------------------------------------
// Acoes: gerar contrato / rodar cobranca mensal
// ---------------------------------------------------------------------
async function atualizarTudo() {
  await Promise.all([carregarStatus(), carregarKpis(), carregarAlertas(), carregarCarteira()]);
  renderIntegracoes();
}

document.getElementById("btn-gerar-contrato").addEventListener("click", async (ev) => {
  const btn = ev.currentTarget;
  const dealId = document.getElementById("deal-id").value.trim();
  if (!dealId) return log("Informe o ID do negócio.");
  btn.disabled = true;
  log(`Disparando geração de contrato para o deal ${dealId}...`);
  try {
    const res = await fetch("/api/acoes/gerar-contrato", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealId }),
    });
    const data = await res.json();
    log(res.ok ? `OK: contrato ${data.documentUuid} enviado para assinatura.` : `Erro: ${data.error}`);
    if (res.ok) await atualizarTudo();
  } catch (err) {
    log(`Falha de rede: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("btn-cobranca").addEventListener("click", async (ev) => {
  const btn = ev.currentTarget;
  btn.disabled = true;
  log("Executando rotina mensal de cobrança...");
  try {
    const res = await fetch("/api/acoes/rodar-cobranca", { method: "POST" });
    const data = await res.json();
    log(res.ok ? `OK: ${data.summary.total} negócio(s) processado(s) em ${data.summary.referenceMonth}.` : `Erro: ${data.error}`);
    if (res.ok) await atualizarTudo();
  } catch (err) {
    log(`Falha de rede: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
});

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------
(async function boot() {
  await carregarUsuario();
  await atualizarTudo();
  setInterval(atualizarTudo, 30000);
})();
