// Phase 4 (REVEAL) + Phase 5 (SHARE LANDING) — the same scene engine.

import { countUp, formatNumber, escapeHtml, prefersReducedMotion, LAB_TITLES } from "/js/util.js";
import { shareWhatsappUrl, icsUrl, publicShareUrl, getShareUrl } from "/js/api.js";

const ACCENTS = {
  "Visibilidade":  "var(--accent-vis)",
  "Reputação":     "var(--accent-rep)",
  "Consistência":  "var(--accent-con)",
};

/**
 * Run the reveal.
 * @param {Object} opts
 * @param {DiagnosticResult} opts.result
 * @param {string} opts.sid
 * @param {Set<string>} [opts.distinctSources] — optional, for Scene 2 count.
 * @param {boolean} [opts.shareLanding] — true when running on /r/:sid (recipient view).
 */
export function startReveal({ result, sid, distinctSources, shareLanding = false }) {
  const host = document.getElementById("scene-host");
  const dotsEl = document.getElementById("reveal-dots");
  const skipBtn = document.getElementById("scene-skip");
  host.innerHTML = "";

  const scenes = buildScenes({ result, sid, distinctSources, shareLanding });

  // Build progress dots
  dotsEl.innerHTML = "";
  scenes.forEach(() => {
    const li = document.createElement("li");
    li.className = "reveal-dot";
    dotsEl.appendChild(li);
  });

  // Render all scene shells (cheap; we hide via opacity).
  scenes.forEach((s, i) => {
    const sec = document.createElement("section");
    sec.className = "scene";
    sec.setAttribute("role", "region");
    sec.setAttribute("aria-label", s.ariaLabel);
    sec.dataset.idx = String(i);
    sec.innerHTML = `<div class="scene-inner">${s.html}</div>`;
    host.appendChild(sec);
  });

  let current = -1;
  let timer = 0;

  function setCurrent(i) {
    if (i >= scenes.length) i = scenes.length - 1;
    if (i === current) return;
    if (current >= 0) host.children[current].classList.remove("active");
    current = i;
    const el = host.children[current];
    el.classList.add("active");
    // Update dots
    Array.from(dotsEl.children).forEach((d, idx) => {
      d.classList.toggle("done", idx < current);
      d.classList.toggle("current", idx === current);
    });
    // Hide skip on final share scene.
    skipBtn.hidden = current === scenes.length - 1;
    scenes[current].onEnter?.(el);
    scheduleAuto();
  }

  function scheduleAuto() {
    clearTimeout(timer);
    const dwell = scenes[current].dwellMs;
    // prefers-reduced-motion only suppresses transitions (handled in CSS).
    // Auto-advance still fires so the experience completes for keyboard/AT users.
    if (dwell > 0) timer = setTimeout(advance, dwell);
  }

  function advance() { setCurrent(current + 1); }

  function onTap(e) {
    // Ignore taps on actual buttons/links inside the scene.
    if (e.target.closest("button, a")) return;
    if (current < scenes.length - 1) advance();
  }

  host.addEventListener("click", onTap);
  skipBtn.addEventListener("click", advance);
  document.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") {
      if (current < scenes.length - 1) { advance(); e.preventDefault(); }
    }
  });

  setCurrent(0);
}

/* ---------- Scene builders ---------- */

function buildScenes({ result, sid, distinctSources, shareLanding }) {
  const scenes = [];
  const shopName = result.shop?.name ?? "a tua loja";

  // Scene 1 — Hero (brief: 5s for short scenes / 8s for axis scenes)
  scenes.push({
    ariaLabel: "Cena 1: O teu raio-x digital",
    dwellMs: 5000,
    html: `
      <p class="scene-prefix">O Raio-X Digital de</p>
      <h1 class="scene-shop-name">${escapeHtml(shopName)}</h1>
      <span class="scene-accent-line" aria-hidden="true"></span>
      <p class="scene-mark">AHI</p>`,
  });

  // Scene 2 — Discovery: max of distinct sources found and summed evidence_count.
  const sources = collectSources(result, distinctSources);
  const evidenceSum = result.axes.reduce((n, a) => n + (a.evidence_count ?? 0), 0);
  const discoveryCount = Math.max(sources.length, evidenceSum);
  scenes.push({
    ariaLabel: "Cena 2: Onde te encontrei",
    dwellMs: 6000,
    html: `
      <p class="scene-prefix">Encontrei-te em</p>
      <div class="scene-mega" data-count="${discoveryCount}">0</div>
      <p class="scene-mega-label">${discoveryCount === 1 ? "sítio" : "sítios"}</p>
      <p class="scene-sources">
        ${sources.slice(0, 6).map((s) => `<span>${escapeHtml(s)}</span>`).join("·")}
      </p>`,
    onEnter(el) {
      const num = el.querySelector(".scene-mega");
      countUp(num, Number(num.dataset.count), 1200);
      const spans = el.querySelectorAll(".scene-sources span");
      spans.forEach((sp, i) => setTimeout(() => sp.classList.add("in"), 300 + i * 300));
    },
  });

  // Scenes 3, 4, 5 — Visibilidade, Reputação, Consistência
  result.axes.forEach((axis) => {
    scenes.push({
      ariaLabel: `Cena: ${axis.name}`,
      dwellMs: 8000,
      html: renderAxisScene(axis),
    });
  });

  // Scene 6 — Esta semana.
  // Merchant view: full numbered action list ("the payoff" per brief).
  // Share-landing (recipient): just a teaser line — recipient isn't the merchant
  // so the merchant-only action items would be noise.
  if (!shareLanding) {
    const top3 = result.axes
      .map((a) => a.recommendations?.[0]?.action)
      .filter(Boolean)
      .slice(0, 3);
    scenes.push({
      ariaLabel: "Cena: O que fazer esta semana",
      dwellMs: 7000,
      html: `
        <h2 class="week-title">O que fazer esta semana</h2>
        <ol class="week-list">
          ${top3.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}
        </ol>
        <p class="week-foot">Cada um leva menos de 30 minutos.</p>`,
    });
  } else {
    scenes.push({
      ariaLabel: "Cena: Esta semana",
      dwellMs: 5000,
      html: `
        <h2 class="week-title">Esta semana</h2>
        <p class="week-foot">3 ações pequenas para a loja crescer online.</p>`,
    });
  }

  // Scene 7 — replaced by "Faz o teu raio-x" CTA on /r/:sid (share-landing).
  if (shareLanding) {
    scenes.push({
      ariaLabel: "Cena: Faz o teu raio-x",
      dwellMs: 7000,
      html: `
        <p class="scene-prefix">Em 90 segundos</p>
        <h2 class="lab-title">Faz o teu raio-x</h2>
        <p class="lab-where">Anónimo. Lê só fontes públicas.</p>
        <a class="btn btn-primary" href="/">Faz o teu raio-x</a>`,
    });
  } else if (result.lab_hint && LAB_TITLES[result.lab_hint]) {
    const labNum = result.lab_hint.replace("lab_", "");
    const ics = icsUrl(sid, result.lab_hint);
    scenes.push({
      ariaLabel: `Cena: Lab ${labNum}`,
      dwellMs: 7000,
      html: `
        <p class="lab-when">Amanhã às 14:00</p>
        <p class="lab-tag">Lab ${escapeHtml(labNum)}</p>
        <h2 class="lab-title">${escapeHtml(LAB_TITLES[result.lab_hint])}</h2>
        <p class="lab-where">Salão Nobre, Alfândega do Porto</p>
        <a class="btn btn-primary" id="lab-cta" href="${ics}">Lembra-me</a>
        <p class="lab-confirm" id="lab-confirm" aria-live="polite"></p>`,
      onEnter(el) {
        const a = el.querySelector("#lab-cta");
        const confirm = el.querySelector("#lab-confirm");
        a.addEventListener("click", () => {
          // Browser handles the .ics download / Google Calendar redirect.
          // No extra confirmation copy: brief locks no string for this.
          confirm.textContent = "";
        });
      },
    });
  }

  // Scene 8 — Share. WhatsApp URL comes from GET /api/share (with safe fallback).
  const shareUrl = publicShareUrl(sid);
  scenes.push({
    ariaLabel: "Cena: Partilha",
    dwellMs: 0, // final
    html: `
      <h2 class="week-title">Partilha o teu raio-x</h2>
      <div class="share-actions">
        <a class="btn btn-primary" id="share-wa" href="${shareWhatsappUrl(shareUrl)}" target="_blank" rel="noopener">WhatsApp</a>
        <button type="button" class="btn btn-secondary" id="share-copy">Copiar link</button>
      </div>
      <span class="scene-accent-line" aria-hidden="true"></span>
      <p class="share-foot">Já ajudámos 200+ comerciantes do Porto este ano. — AHI</p>`,
    onEnter(el) {
      // Replace the WA href with the server-prepared one as soon as it arrives.
      const wa = el.querySelector("#share-wa");
      getShareUrl(sid).then((url) => { if (url) wa.href = url; }).catch(() => {});
      const btn = el.querySelector("#share-copy");
      btn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(shareUrl);
          const prev = btn.textContent;
          btn.textContent = "Copiado ✓";
          setTimeout(() => { btn.textContent = prev; }, 2000);
        } catch {
          // Fallback: select-and-copy via temp textarea.
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
  const accent = ACCENTS[axis.name] ?? "var(--text)";
  const stat = pickAxisStat(axis);
  const recs = (axis.recommendations ?? []).slice(0, 2);
  const partial = axis.partial && axis.partial_reason
    ? `<p class="axis-partial">*Não consegui ler ${escapeHtml(axis.partial_reason)}.*</p>` : "";
  return `
    <span class="axis-stripe" style="background:${accent}" aria-hidden="true"></span>
    <h2 class="axis-name">${escapeHtml(axis.name)}</h2>
    ${stat ? `<p class="axis-stat">${escapeHtml(stat.value)}<span class="axis-stat-label">${escapeHtml(stat.label)}</span></p>` : ""}
    <p class="axis-summary">${escapeHtml(axis.summary)}</p>
    ${recs.length ? `<p class="axis-recs-title">Esta semana podes:</p>
      <ul class="axis-recs">${recs.map((r) => `<li>${escapeHtml(r.action)}</li>`).join("")}</ul>` : ""}
    ${partial}`;
}

function pickAxisStat(axis) {
  const n = axis.evidence_count;
  if (typeof n !== "number" || n <= 0) return null;
  if (axis.name === "Visibilidade") return { value: formatNumber(n), label: n === 1 ? "canal onde apareces" : "canais onde apareces" };
  if (axis.name === "Reputação")     return { value: formatNumber(n), label: n === 1 ? "review no Google" : "reviews no Google" };
  if (axis.name === "Consistência")  return { value: formatNumber(n), label: "sinais cruzados" };
  return { value: formatNumber(n), label: "sinais" };
}

function collectSources(result, hinted) {
  const set = new Set(hinted ?? []);
  // Always include channels implied by the diagnostic shape.
  if (result.shop?.place_id || (result.axes[0]?.evidence_count ?? 0) > 0) set.add("Google");
  // Heuristic: pull words off the axis summaries we know map to channels.
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
