// Result page controller — wires up Phase 3 (poll), Phase 4 (reveal), Phase 5 (share landing).

import { startPolling, sumDistinctSources } from "/js/poll.js";
import { startReveal } from "/js/reveal.js";

const viewWaiting = document.getElementById("view-waiting");
const viewError   = document.getElementById("view-error");
const viewReveal  = document.getElementById("view-reveal");

function show(view) {
  viewWaiting.hidden = view !== viewWaiting;
  viewError.hidden   = view !== viewError;
  viewReveal.hidden  = view !== viewReveal;
}

function showError({ message, retryLabel, onRetry }) {
  document.getElementById("error-message").textContent = message;
  const retryBtn = document.getElementById("error-retry");
  if (retryLabel && onRetry) {
    retryBtn.hidden = false;
    retryBtn.textContent = retryLabel;
    retryBtn.onclick = onRetry;
  } else {
    retryBtn.hidden = true;
    retryBtn.onclick = null;
  }
  show(viewError);
}

function getSidFromUrl() {
  const url = new URL(window.location.href);
  return url.searchParams.get("sid");
}

function getStashedShopName(sid) {
  try { return sessionStorage.getItem(`raiox:${sid}:shop`); } catch { return null; }
}

function bootShareLanding(sid) {
  const result = window.__INITIAL_DATA__;
  show(viewReveal);
  startReveal({ result, sid, shareLanding: true });
}

function bootLive(sid) {
  show(viewWaiting);
  const shopName = getStashedShopName(sid);

  let pollHandle = null;

  function onDone(result, progress) {
    const distinct = sumDistinctSources(progress);
    rememberCompletedAssessment(sid, result);
    show(viewReveal);
    startReveal({ result, sid, distinctSources: distinct, shareLanding: false });
  }

  function onError() {
    forgetAssessment(sid);
    showError({
      message: "Algo correu mal — tenta de novo daqui a uns segundos.",
      retryLabel: "Recomeçar",
      onRetry: () => { window.location.href = "/"; },
    });
  }
  function onExpired() {
    forgetAssessment(sid);
    showError({
      message: "Esta análise expirou — recomeça aqui.",
      retryLabel: "Recomeçar",
      onRetry: () => { window.location.href = "/"; },
    });
  }
  function onTimeout() {
    showError({
      message: "Demorou mais do que esperava — segue por aqui dentro de uns minutos.",
      retryLabel: "Ver agora",
      onRetry: () => {
        show(viewWaiting);
        pollHandle?.pokeNow();
      },
    });
  }

  pollHandle = startPolling({ sid, shopName, onDone, onError, onExpired, onTimeout });
}

// Bootstrap.
(function main() {
  const sid = getSidFromUrl() ?? extractSidFromShareLanding();
  if (window.__INITIAL_DATA__ && sid) {
    bootShareLanding(sid);
    return;
  }
  if (!sid) {
    showError({
      message: "Faltou o link — volta ao início para começares uma nova análise.",
      retryLabel: "Recomeçar",
      onRetry: () => { window.location.href = "/"; },
    });
    return;
  }
  bootLive(sid);
})();

function extractSidFromShareLanding() {
  // Path of the form `/r/:sid` for the API-rendered share landing.
  const m = window.location.pathname.match(/\/r\/([^/?#]+)/);
  return m ? m[1] : null;
}

// Persist successful diagnostics so the homepage can list them as pills.
// De-dupes by sid (latest wins), capped at 6, newest-first.
function rememberCompletedAssessment(sid, result) {
  try {
    const KEY = "raiox:history";
    const name = result?.shop?.name;
    if (!sid || !name) return;
    const raw = window.localStorage.getItem(KEY);
    let list = [];
    if (raw) {
      try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) list = parsed; } catch {}
    }
    list = list.filter((e) => e && e.sid !== sid);
    list.unshift({
      sid,
      name,
      address: result?.shop?.address ?? "",
      completedAt: Date.now(),
    });
    list.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, 6)));
  } catch { /* storage disabled — fine to skip */ }
}

// Drop a sid from the homepage history when its result is no longer
// retrievable (server-expired or errored), so the pill self-cleans.
function forgetAssessment(sid) {
  try {
    const KEY = "raiox:history";
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const next = parsed.filter((e) => e && e.sid !== sid);
    if (next.length !== parsed.length) {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    }
  } catch { /* storage disabled — fine to skip */ }
}
