// Phase 3 — polling + 3×3 tile grid + featured fact + progress bar.
// Resolves with the final DiagnosticResult when state === "done".

import { getStatus } from "/js/api.js";
import { pickFact, stagePercent, countUp, formatNumber, escapeHtml } from "/js/util.js";
import { buildTileGrid } from "/js/tiles.js";

export function startPolling({ sid, shopName, onDone, onError, onExpired, onTimeout }) {
  const shopPin = document.getElementById("wait-shop-name");
  const statusEl = document.getElementById("result-status");
  const bar = document.getElementById("progress-bar");
  const stack = document.getElementById("fact-stack");
  const line = document.getElementById("progress-line");
  const netLine = document.getElementById("net-line");
  const gridHost = document.getElementById("tile-grid");
  const activityEl = document.getElementById("activity-line");

  if (shopName) shopPin.textContent = shopName;

  const grid = buildTileGrid(gridHost);
  const activity = startActivityCycler(activityEl);

  const start = Date.now();
  let backoff = 0;
  let renderedCount = 0;
  let timedOut = false;
  let stopped = false;
  let currentCard = null;

  function setBar(pct) { bar.style.width = `${Math.max(6, Math.min(100, pct))}%`; }

  function showFeaturedFact(label, value) {
    // Replace the single featured card with a new one; tile grid is the cumulative view.
    if (currentCard) currentCard.remove();
    const card = document.createElement("div");
    card.className = "fact-card";
    const num = document.createElement("div");
    num.className = "fact-number";
    const isNumeric = typeof value === "number" && Number.isFinite(value);
    if (!isNumeric) {
      num.classList.add("is-string");
      num.textContent = String(value);
    } else {
      num.textContent = "0";
    }
    const lab = document.createElement("div");
    lab.className = "fact-label";
    lab.textContent = label;
    card.append(num, lab);
    stack.appendChild(card);
    requestAnimationFrame(() => card.classList.add("in"));
    if (isNumeric) countUp(num, value, 1100);
    currentCard = card;
  }

  function paintProgress(progress) {
    if (!Array.isArray(progress)) return;

    const last = progress[progress.length - 1];
    if (last?.text) line.textContent = last.text;

    for (let i = progress.length - 1; i >= 0; i--) {
      if (progress[i].stage) { setBar(stagePercent(progress[i].stage)); break; }
    }

    grid.lightUp(progress.length);

    if (progress.length > 0) {
      statusEl.textContent = "A descobrir-te peça a peça…";
    }

    for (let i = renderedCount; i < progress.length; i++) {
      const fact = pickFact(progress[i].data);
      if (fact) {
        const num = typeof fact.number === "string"
          ? (Number.isFinite(Number(fact.number.replace(/[^\d-]/g, ""))) && /^\d/.test(fact.number)
              ? Number(fact.number.replace(/[^\d-]/g, ""))
              : fact.number)
          : fact.number;
        showFeaturedFact(fact.label, num);
      }
    }
    renderedCount = progress.length;
  }

  async function tick() {
    if (stopped) return;
    if (Date.now() - start > 180_000 && !timedOut) {
      timedOut = true;
      activity.stop();
      onTimeout?.();
    }
    try {
      const status = await getStatus(sid);
      backoff = 0;
      netLine.hidden = true;
      paintProgress(status.progress);

      if (status.state === "done") {
        setBar(100);
        grid.lightUp(9);
        statusEl.textContent = "Painel completo";
        stopped = true;
        activity.stop();
        onDone?.(status.result, status.progress);
        return;
      }
      if (status.state === "error") {
        stopped = true;
        activity.stop();
        onError?.(status.error);
        return;
      }
      if (status.state === "expired") {
        stopped = true;
        activity.stop();
        onExpired?.();
        return;
      }
    } catch {
      backoff = backoff === 0 ? 1000 : Math.min(backoff * 2, 15000);
      netLine.hidden = false;
    }
    const elapsed = Date.now() - start;
    const baseDelay = elapsed < 30_000 ? 800 : 1500;
    const delay = backoff > 0 ? backoff : baseDelay;
    setTimeout(tick, delay);
  }

  setTimeout(tick, 200);

  return {
    stop() { stopped = true; activity.stop(); },
    pokeNow() {
      if (timedOut) {
        timedOut = false;
        activity.restart?.();
      }
      tick();
    },
  };
}

const ACTIVITY_MESSAGES = [
  "A ouvir o que dizem de ti…",
  "A medir a tua pegada no Instagram…",
  "A contar estrelas no Google…",
  "A folhear o teu site…",
  "A espreitar a tua página no Facebook…",
  "A ler comentários de clientes…",
  "A juntar os pedaços do puzzle…",
  "A procurar fotos da tua loja…",
  "A consultar mapas e moradas…",
  "A comparar com lojas da tua rua…",
  "A confirmar horários de abertura…",
  "A apanhar menções recentes…",
];

function startActivityCycler(el) {
  if (!el) return { stop() {}, restart() {} };
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.classList.add("activity-line");
  if (reduce) el.classList.add("is-reduced");

  const pool = ACTIVITY_MESSAGES.slice();
  let idx = Math.floor(Math.random() * pool.length);
  let timer = 0;
  let stopped = false;

  function show(msg) {
    if (reduce) {
      el.style.opacity = "0";
      setTimeout(() => {
        if (stopped) return;
        el.textContent = msg;
        el.style.opacity = "1";
      }, 180);
    } else {
      el.classList.remove("in");
      el.classList.add("out");
      setTimeout(() => {
        if (stopped) return;
        el.textContent = msg;
        el.classList.remove("out");
        el.classList.add("in");
      }, 220);
    }
  }

  function next() {
    if (stopped) return;
    idx = (idx + 1) % pool.length;
    show(pool[idx]);
    timer = setTimeout(next, 2600);
  }

  function begin() {
    stopped = false;
    el.textContent = pool[idx];
    el.classList.add("in");
    clearTimeout(timer);
    timer = setTimeout(next, 2600);
  }

  begin();

  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
      el.classList.remove("in");
    },
    restart() { begin(); },
  };
}

export function sumDistinctSources(progress) {
  const set = new Set();
  for (const p of progress ?? []) {
    if (p?.data?.source_found) set.add(p.data.source_found);
  }
  for (const p of progress ?? []) {
    const d = p?.data;
    if (!d) continue;
    if (typeof d.reviews_count === "number") set.add("Google");
    if (typeof d.instagram_followers === "number" || typeof d.instagram_posts === "number") set.add("Instagram");
    if (typeof d.facebook_followers === "number") set.add("Facebook");
    if (typeof d.site_url === "string") set.add("Site");
  }
  return set;
}

export { formatNumber, escapeHtml };
