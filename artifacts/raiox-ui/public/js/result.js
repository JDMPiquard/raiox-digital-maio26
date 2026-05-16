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
    show(viewReveal);
    startReveal({ result, sid, distinctSources: distinct, shareLanding: false });
  }

  function onError() {
    showError({
      message: "Algo correu mal — tenta de novo daqui a uns segundos.",
      retryLabel: "Recomeçar",
      onRetry: () => { window.location.href = "/"; },
    });
  }
  function onExpired() {
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
