// Phase 3 — polling + fact-card stack + progress bar.
// Resolves with the final DiagnosticResult when state === "done".

import { getStatus } from "/js/api.js";
import { pickFact, stagePercent, countUp, formatNumber, escapeHtml } from "/js/util.js";

const MAX_VISIBLE_CARDS = 5;

export function startPolling({ sid, shopName, onDone, onError, onExpired, onTimeout }) {
  const shopPin = document.getElementById("wait-shop-name");
  const bar = document.getElementById("progress-bar");
  const stack = document.getElementById("fact-stack");
  const line = document.getElementById("progress-line");
  const netLine = document.getElementById("net-line");

  if (shopName) shopPin.textContent = shopName;

  const start = Date.now();
  let backoff = 0;       // current network-failure backoff (ms); 0 when healthy
  let renderedCount = 0; // how many progress entries we've already painted
  let timedOut = false;
  let stopped = false;

  function setBar(pct) { bar.style.width = `${Math.max(6, Math.min(100, pct))}%`; }

  function pushFactCard(label, number) {
    const card = document.createElement("div");
    card.className = "fact-card";
    card.setAttribute("aria-label", `${number} ${label}`);
    const num = document.createElement("div");
    num.className = "fact-number";
    num.textContent = "0";
    const lab = document.createElement("div");
    lab.className = "fact-label";
    lab.textContent = label;
    card.append(num, lab);
    stack.appendChild(card);
    requestAnimationFrame(() => card.classList.add("in"));
    if (typeof number === "number") countUp(num, number, 1100);
    else num.textContent = String(number);

    // Fade out oldest beyond MAX_VISIBLE_CARDS.
    const visible = stack.querySelectorAll(".fact-card.in:not(.out)");
    if (visible.length > MAX_VISIBLE_CARDS) {
      visible[0].classList.add("out");
    }
  }

  function paintProgress(progress) {
    if (!Array.isArray(progress)) return;
    // Latest line.
    const last = progress[progress.length - 1];
    if (last?.text) line.textContent = last.text;
    // Bar from latest known stage.
    for (let i = progress.length - 1; i >= 0; i--) {
      if (progress[i].stage) { setBar(stagePercent(progress[i].stage)); break; }
    }
    // New cards for any new entries with `data` we can summarise.
    for (let i = renderedCount; i < progress.length; i++) {
      const p = progress[i];
      // Pin shop name from identifying message if we still don't have one.
      if (!shopName && p.text && shopPin.textContent === "A tua loja") {
        // Leave default; the result page will repin from the result payload.
      }
      const fact = pickFact(p.data);
      if (fact) {
        const numericMatch = typeof fact.number === "string"
          ? Number(fact.number.replace(/[^\d-]/g, ""))
          : fact.number;
        pushFactCard(fact.label,
          Number.isFinite(numericMatch) && /^\d/.test(String(fact.number)) ? numericMatch : fact.number);
      }
    }
    renderedCount = progress.length;
  }

  async function tick() {
    if (stopped) return;
    if (Date.now() - start > 180_000 && !timedOut) {
      timedOut = true;
      onTimeout?.();
      // Still keep polling in the background so [Ver agora] can resolve fast.
    }
    try {
      const status = await getStatus(sid);
      backoff = 0;
      netLine.hidden = true;
      paintProgress(status.progress);

      if (status.state === "done") {
        setBar(100);
        stopped = true;
        onDone?.(status.result, status.progress);
        return;
      }
      if (status.state === "error") {
        stopped = true;
        onError?.(status.error);
        return;
      }
      if (status.state === "expired") {
        stopped = true;
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

  // Quick first poll.
  setTimeout(tick, 200);

  return {
    stop() { stopped = true; },
    pokeNow() { tick(); },
  };
}

// Tiny helper used by the result controller.
export function sumDistinctSources(progress) {
  const set = new Set();
  for (const p of progress ?? []) {
    if (p?.data?.source_found) set.add(p.data.source_found);
  }
  // Add the canonical channels that produced numbers.
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

// Re-export helpers used by reveal.js that shouldn't pull a separate file.
export { formatNumber, escapeHtml };
