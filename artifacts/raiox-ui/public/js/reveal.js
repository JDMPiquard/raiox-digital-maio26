// Phase 4 (REVEAL) + Phase 5 (SHARE LANDING) — Azulejo scene engine.
// Editorial mobile reveal: "Capítulo I", "Eixo 1 de 3", cobalt + terracotta + olive.

import { countUp, formatNumber, escapeHtml, LAB_TITLES } from "/js/util.js";
import { shareWhatsappUrl, icsUrl, publicShareUrl, getShareUrl } from "/js/api.js";
import { tileMotif } from "/js/tiles.js";

// Axis colours — cobalt / terracotta / olive, in fixed order matching the brief.
const AXIS_COLOR = {
  "Visibilidade": "var(--cobalt)",
  "Reputação":    "var(--terracotta)",
  "Consistência": "var(--olive)",
};
const AXIS_INDEX = { "Visibilidade": 1, "Reputação": 2, "Consistência": 3 };

export function startReveal({ result, sid, distinctSources, shareLanding = false }) {
  const host = document.getElementById("scene-host");
  const dotsEl = document.getElementById("reveal-dots");
  const skipBtn = document.getElementById("scene-skip");
  const backBtn = document.getElementById("scene-back");
  host.innerHTML = "";

  const scenes = buildScenes({ result, sid, distinctSources, shareLanding });

  dotsEl.innerHTML = "";
  scenes.forEach(() => {
    const li = document.createElement("li");
    li.className = "reveal-dot";
    dotsEl.appendChild(li);
  });

  scenes.forEach((s, i) => {
    const sec = document.createElement("section");
    sec.className = `scene ${s.modifier ?? ""}`;
    sec.setAttribute("role", "region");
    sec.setAttribute("aria-label", s.ariaLabel);
    sec.dataset.idx = String(i);
    sec.innerHTML = `<div class="scene-inner">${s.html}</div>`;
    host.appendChild(sec);
  });

  let current = -1;
  let timer = 0;

  function setCurrent(i, { replay = false } = {}) {
    if (i >= scenes.length) i = scenes.length - 1;
    if (i < 0) i = 0;
    if (i === current && !replay) return;
    if (current >= 0 && current !== i) host.children[current].classList.remove("active");
    current = i;
    const el = host.children[current];
    el.classList.add("active");
    Array.from(dotsEl.children).forEach((d, idx) => {
      d.classList.toggle("done", idx < current);
      d.classList.toggle("current", idx === current);
    });
    skipBtn.hidden = current === scenes.length - 1;
    backBtn.hidden = current === 0;
    // Replay any onEnter animations (count-ups, staggered tiles, etc.) when
    // re-entering a scene via back-navigation so it doesn't look frozen.
    scenes[current].onEnter?.(el);
    scheduleAuto();
  }

  function scheduleAuto() {
    clearTimeout(timer);
    const dwell = scenes[current].dwellMs;
    if (dwell > 0) timer = setTimeout(advance, dwell);
  }

  function advance() { setCurrent(current + 1); }
  function rewind() { setCurrent(current - 1, { replay: true }); }

  function onTap(e) {
    if (e.target.closest("button, a")) return;
    // Instagram-stories tap zones: left third → back, rest → forward.
    const rect = host.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width / 3) {
      if (current > 0) rewind();
    } else if (current < scenes.length - 1) {
      advance();
    }
  }

  host.addEventListener("click", onTap);
  skipBtn.addEventListener("click", advance);
  backBtn.addEventListener("click", rewind);
  document.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight") {
      if (current < scenes.length - 1) { advance(); e.preventDefault(); }
    } else if (e.key === "ArrowLeft") {
      if (current > 0) { rewind(); e.preventDefault(); }
    }
  });

  setCurrent(0);
}

/* ---------- Scene builders ---------- */

function buildScenes({ result, sid, distinctSources, shareLanding }) {
  const scenes = [];
  const shop = result.shop ?? {};
  const shopName = shop.name ?? "a tua loja";

  // 1 — Hero (editorial nameplate + corner tile motif)
  scenes.push({
    ariaLabel: "Cena 1: O teu raio-x digital",
    modifier: "scene--hero",
    dwellMs: 4200,
    html: `
      <p class="scene-prefix">O Raio-X Digital de</p>
      <h1 class="scene-shop-name">${escapeHtml(shopName)}</h1>
      <span class="scene-accent-line" aria-hidden="true"></span>
      ${shop.address ? `<p class="scene-shop-addr">${escapeHtml(shop.address)}</p>` : ""}
      <p class="scene-foot">· AHI ·</p>`,
  });

  // 2 — Discovery: "Encontrei-te em N canais" with 3×3 tile cells per source
  const sources = collectSources(result, distinctSources);
  const evidenceSum = result.axes.reduce((n, a) => n + (a.evidence_count ?? 0), 0);
  const discoveryCount = Math.max(sources.length, evidenceSum);
  scenes.push({
    ariaLabel: "Cena 2: Onde te encontrei",
    modifier: "scene--discovery",
    dwellMs: 5500,
    html: `
      <p class="scene-prefix">Capítulo I</p>
      <p class="scene-mega-label" style="margin:6px 0 0">Encontrei-te em</p>
      <div class="scene-mega" data-count="${discoveryCount}">0</div>
      <p class="scene-mega-label">${discoveryCount === 1 ? "canal." : "canais."}</p>
      <ul class="scene-sources" aria-label="Canais encontrados">
        ${sources.slice(0, 6).map((s, i) => `
          <li data-i="${i}">
            ${tileMotif(i)}
            <span class="src-label">${escapeHtml(s)}</span>
          </li>`).join("")}
      </ul>`,
    onEnter(el) {
      const num = el.querySelector(".scene-mega");
      countUp(num, Number(num.dataset.count), 1100);
      const items = el.querySelectorAll(".scene-sources li");
      items.forEach((li, i) => setTimeout(() => li.classList.add("in"), 280 + i * 280));
    },
  });

  // 3, 4, 5 — Axis scenes (Visibilidade · Reputação · Consistência)
  result.axes.forEach((axis) => {
    scenes.push({
      ariaLabel: `Cena: ${axis.name}`,
      dwellMs: 7500,
      html: renderAxisScene(axis),
    });
  });

  // 6 — Esta semana
  if (!shareLanding) {
    const top3 = result.axes
      .map((a) => ({ axis: a.name, action: a.recommendations?.[0]?.action }))
      .filter((r) => r.action)
      .slice(0, 3);
    scenes.push({
      ariaLabel: "Cena: O que fazer esta semana",
      dwellMs: 7000,
      html: `
        <p class="scene-prefix">Capítulo V · Agenda</p>
        <h2 class="week-title">O que fazer<br/>esta semana.</h2>
        <ol class="week-list">
          ${top3.map((r) => `<li>${escapeHtml(r.action)}</li>`).join("")}
        </ol>
        <p class="week-foot">Cada um leva menos de 30 minutos.</p>`,
    });
  } else {
    scenes.push({
      ariaLabel: "Cena: Esta semana",
      dwellMs: 5000,
      html: `
        <p class="scene-prefix">Capítulo V · Agenda</p>
        <h2 class="week-title">Esta semana.</h2>
        <p class="axis-summary">3 ações pequenas para a loja crescer online.</p>`,
    });
  }

  // 7 — Lab CTA (or shared CTA for recipients)
  if (shareLanding) {
    const url = "/";
    scenes.push({
      ariaLabel: "Cena: Faz o teu raio-x",
      dwellMs: 7000,
      html: `
        <p class="scene-prefix">Tens uma loja?</p>
        <h2 class="lab-title">Faz o <i style="color:var(--terracotta);font-style:italic">teu</i> raio-x.</h2>
        <p class="lab-where">90 segundos. Não pedimos email, nem telefone, nem nada.</p>
        <a class="btn" href="${url}">Faz o teu raio-x →</a>`,
    });
  } else if (result.lab_hint && LAB_TITLES[result.lab_hint]) {
    const labNum = result.lab_hint.replace("lab_", "");
    const ics = icsUrl(sid, result.lab_hint);
    scenes.push({
      ariaLabel: `Cena: Lab ${labNum}`,
      dwellMs: 6500,
      html: `
        <p class="lab-when">Amanhã · 14:00 · Alfândega</p>
        <p class="lab-tag">Lab ${escapeHtml(labNum)}</p>
        <h2 class="lab-title">${escapeHtml(LAB_TITLES[result.lab_hint])}</h2>
        <p class="lab-where">Salão Nobre, Alfândega do Porto.</p>
        <a class="btn" id="lab-cta" href="${ics}">Lembra-me →</a>
        <p class="lab-confirm" id="lab-confirm" aria-live="polite"></p>`,
      onEnter(el) {
        const a = el.querySelector("#lab-cta");
        const confirm = el.querySelector("#lab-confirm");
        a.addEventListener("click", () => { confirm.textContent = ""; });
      },
    });
  }

  // 8 — Share
  const shareUrl = publicShareUrl(sid);
  scenes.push({
    ariaLabel: "Cena: Partilha",
    dwellMs: 0,
    html: `
      <p class="scene-prefix">Última página</p>
      <h2 class="share-title">Partilha o teu raio-x.</h2>
      <p class="share-sub">Manda a um colega comerciante.<br/>Demoram 90 segundos a ver o deles.</p>
      <div class="share-actions">
        <a class="btn" id="share-wa" href="${shareWhatsappUrl(shareUrl)}" target="_blank" rel="noopener">Partilhar no WhatsApp</a>
        <button type="button" class="btn btn-secondary" id="share-copy">Copiar link</button>
      </div>
      <p class="share-foot">Já ajudámos 200+ comerciantes do Porto este ano. — AHI</p>`,
    onEnter(el) {
      const wa = el.querySelector("#share-wa");
      getShareUrl(sid).then((url) => { if (url) wa.href = url; }).catch(() => {});
      const btn = el.querySelector("#share-copy");
      btn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(shareUrl);
          btn.textContent = "Copiado ✓";
          setTimeout(() => { btn.textContent = "Copiar link"; }, 2000);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = shareUrl;
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand("copy"); btn.textContent = "Copiado ✓"; setTimeout(() => btn.textContent = "Copiar link", 2000); } catch {}
          ta.remove();
        }
      });
    },
  });

  return scenes;
}

function renderAxisScene(axis) {
  const color = AXIS_COLOR[axis.name] ?? "var(--cobalt)";
  const idx = AXIS_INDEX[axis.name] ?? 1;
  const stat = pickAxisStat(axis);
  const recs = (axis.recommendations ?? []).slice(0, 2);
  const partial = axis.partial && axis.partial_reason
    ? `<p class="axis-partial">*Não consegui ler ${escapeHtml(axis.partial_reason)}.*</p>` : "";
  return `
    <p class="scene-prefix" style="color:${color}">Eixo ${idx} de 3</p>
    <span class="axis-stripe" style="background:${color};box-shadow:0 3px 0 0 var(--terracotta)" aria-hidden="true"></span>
    <h2 class="axis-name">${escapeHtml(axis.name)}</h2>
    ${stat ? `<div class="axis-stat-box" style="--axis-color:${color}">
      <p class="axis-stat">${escapeHtml(stat.value)}</p>
      <span class="axis-stat-label">${escapeHtml(stat.label)}</span>
    </div>` : ""}
    <p class="axis-summary">${escapeHtml(axis.summary)}</p>
    ${recs.length ? `<p class="axis-recs-title">Esta semana podes</p>
      <ul class="axis-recs">${recs.map((r) => `<li>${escapeHtml(r.action)}</li>`).join("")}</ul>` : ""}
    ${partial}`;
}

function pickAxisStat(axis) {
  const n = axis.evidence_count;
  if (typeof n !== "number" || n <= 0) return null;
  if (axis.name === "Visibilidade") return { value: formatNumber(n), label: n === 1 ? "canal onde apareces" : "canais onde apareces" };
  if (axis.name === "Reputação")    return { value: formatNumber(n), label: n === 1 ? "review no Google" : "reviews no Google" };
  if (axis.name === "Consistência") return { value: formatNumber(n), label: "sinais cruzados" };
  return { value: formatNumber(n), label: "sinais" };
}

function collectSources(result, hinted) {
  const set = new Set(hinted ?? []);
  if (result.shop?.place_id || (result.axes[0]?.evidence_count ?? 0) > 0) set.add("Google");
  const blob = result.axes.map((a) => a.summary ?? "").join(" ").toLowerCase();
  if (blob.includes("instagram"))  set.add("Instagram");
  if (blob.includes("facebook"))   set.add("Facebook");
  if (blob.includes("site"))       set.add("Site");
  if (blob.includes("time out"))   set.add("Time Out");
  if (blob.includes("comércio com história")) set.add("Comércio com História");
  if (blob.includes("tripadvisor")) set.add("TripAdvisor");
  if (blob.includes("jn") || blob.includes("público") || blob.includes("publico")) set.add("Imprensa");
  return Array.from(set);
}
