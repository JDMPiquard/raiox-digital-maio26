// Phase 1 (SCAN) + Phase 2 (CONFIRM), folded into a single screen.

import { autocomplete, startDiagnostic } from "/js/api.js";
import { debounce, escapeHtml } from "/js/util.js";

const input = document.getElementById("shop-input");
const list = document.getElementById("shop-list");
const submit = document.getElementById("scan-submit");
const errorEl = document.getElementById("form-error");
const form = document.getElementById("scan-form");
const combo = input.parentElement;

let predictions = [];
let highlight = -1;
let selected = null;       // { place_id, name, address }
let manualMode = false;    // true → "Não estás no Google Maps?" path
let confirming = false;    // showing the confirm card?
let lastQuery = "";

// Clear any stale mock flag from previous sessions so live autocomplete works.
try { window.localStorage.removeItem("raiox_mock"); } catch {}

function setExpanded(open) {
  combo.setAttribute("aria-expanded", open ? "true" : "false");
  list.hidden = !open;
}

function setSubmitEnabled(on) {
  submit.disabled = !on;
  submit.setAttribute("aria-disabled", on ? "false" : "true");
}

function showError(msg, retry) {
  errorEl.hidden = false;
  errorEl.innerHTML = "";
  errorEl.append(document.createTextNode(msg + " "));
  if (retry) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = "Tentar de novo";
    b.addEventListener("click", () => { errorEl.hidden = true; retry(); });
    errorEl.appendChild(b);
  }
}
function hideError() { errorEl.hidden = true; errorEl.textContent = ""; }

function renderPredictions(items) {
  list.innerHTML = "";
  highlight = -1;
  if (items.length === 0) {
    setExpanded(true);
    const li = document.createElement("li");
    li.className = "combo-empty";
    li.role = "option";
    li.innerHTML = `Não encontrámos a tua loja. <button type="button" id="manual-fallback">Tenta com mais detalhe →</button><br><button type="button" id="manual-fallback-2" class="combo-empty-alt">Não estás no Google Maps?</button>`;
    list.appendChild(li);
    li.querySelector("#manual-fallback").addEventListener("click", () => { input.focus(); setExpanded(false); });
    li.querySelector("#manual-fallback-2").addEventListener("click", enterManualMode);
    return;
  }
  items.slice(0, 8).forEach((p, i) => {
    const li = document.createElement("li");
    li.className = "combo-option";
    li.setAttribute("role", "option");
    li.id = `opt-${i}`;
    li.setAttribute("aria-selected", "false");
    li.innerHTML = `
      <div class="combo-option-name">${escapeHtml(p.name)}</div>
      <div class="combo-option-addr">${escapeHtml(p.address)}</div>`;
    li.addEventListener("mousedown", (e) => { e.preventDefault(); pick(i); });
    list.appendChild(li);
  });
  setExpanded(true);
}

function setHighlight(i) {
  const opts = list.querySelectorAll(".combo-option");
  if (opts.length === 0) return;
  if (i < 0) i = opts.length - 1;
  if (i >= opts.length) i = 0;
  opts.forEach((el, idx) => {
    const on = idx === i;
    el.setAttribute("aria-selected", on ? "true" : "false");
  });
  highlight = i;
  input.setAttribute("aria-activedescendant", opts[i].id);
}

function pick(i) {
  const p = predictions[i];
  if (!p) return;
  // Selecting a real Google Places hit always wins over any earlier "manual" path.
  if (manualMode) exitManualMode();
  selected = p;
  input.value = p.name;
  setExpanded(false);
  showConfirm(p);
}

function exitManualMode() {
  manualMode = false;
  const parishField = document.getElementById("manual-parish");
  if (parishField && parishField.parentElement) parishField.parentElement.remove();
}

function clearSelection() {
  selected = null;
  confirming = false;
  setSubmitEnabled(false);
  removeConfirmCard();
}

const queryRemote = debounce(async (q) => {
  lastQuery = q;
  hideError();
  if (q.length < 2) {
    predictions = [];
    setExpanded(false);
    return;
  }
  try {
    const { predictions: p } = await autocomplete(q);
    if (q !== lastQuery) return; // stale
    predictions = p ?? [];
    renderPredictions(predictions);
  } catch {
    showError("Sem rede agora — toca aqui para tentar de novo.", () => queryRemote(q));
  }
}, 250);

input.addEventListener("input", () => {
  if (selected && input.value !== selected.name) clearSelection();
  queryRemote(input.value.trim());
});

input.addEventListener("focus", () => {
  if (predictions.length > 0 && !selected) setExpanded(true);
});
input.addEventListener("blur", () => {
  // Allow click on dropdown to register first.
  setTimeout(() => setExpanded(false), 100);
});

input.addEventListener("keydown", (e) => {
  if (list.hidden) {
    if (e.key === "ArrowDown" && predictions.length) { setExpanded(true); setHighlight(0); e.preventDefault(); }
    return;
  }
  if (e.key === "ArrowDown") { setHighlight(highlight + 1); e.preventDefault(); }
  else if (e.key === "ArrowUp") { setHighlight(highlight - 1); e.preventDefault(); }
  else if (e.key === "Enter") {
    if (highlight >= 0) { pick(highlight); e.preventDefault(); }
  } else if (e.key === "Escape") { setExpanded(false); }
});

/* ---------- Confirm card (Phase 2 inline) ---------- */

function showConfirm(p) {
  confirming = true;
  setSubmitEnabled(true);
  removeConfirmCard();
  const card = document.createElement("div");
  card.id = "confirm-card";
  card.className = "confirm-card";
  const initial = (p.name?.trim()?.[0] ?? "·").toUpperCase();
  const thumb = p.thumbnail_url
    ? `<img class="confirm-thumb" src="${escapeHtml(p.thumbnail_url)}" alt="" />`
    : `<div class="confirm-thumb confirm-thumb--placeholder" aria-hidden="true">${escapeHtml(initial)}</div>`;
  card.innerHTML = `
    <div class="confirm-row">
      ${thumb}
      <div class="confirm-text">
        <div class="confirm-name">${escapeHtml(p.name)}</div>
        <div class="confirm-addr">${escapeHtml(p.address)}</div>
      </div>
    </div>
    <p class="confirm-q">É esta a tua loja?</p>
    <button type="button" class="back-link" id="back-search">Procurar outra</button>
  `;
  // Insert above the submit button
  submit.parentNode.insertBefore(card, submit);
  card.querySelector("#back-search").addEventListener("click", () => {
    clearSelection();
    input.value = "";
    input.focus();
  });
  submit.textContent = "Sim, começar";
}
function removeConfirmCard() {
  const c = document.getElementById("confirm-card");
  if (c) c.remove();
  submit.textContent = "Começar";
}

/* ---------- Manual entry path (no Google Maps result) ---------- */

function enterManualMode() {
  manualMode = true;
  selected = null;
  setExpanded(false);
  removeConfirmCard();
  // Keep current input value as shop_name; allow optional parish in a second field.
  if (document.getElementById("manual-parish")) return;
  const wrap = document.createElement("div");
  wrap.className = "scan-form";
  wrap.style.gap = "12px";
  wrap.innerHTML = `
    <label for="manual-parish" class="field-label">Freguesia (opcional)</label>
    <input id="manual-parish" class="field-input" type="text" placeholder="ex: Cedofeita" />
  `;
  submit.parentNode.insertBefore(wrap, submit);
  setSubmitEnabled(input.value.trim().length >= 2);
  input.addEventListener("input", () => {
    setSubmitEnabled(input.value.trim().length >= 2);
  });
}

/* ---------- Recent completed assessments (pills) ---------- */

(function renderHistoryChips() {
  const host = document.getElementById("history-chips");
  if (!host) return;
  let list = [];
  try {
    const raw = window.localStorage.getItem("raiox:history");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    }
  } catch { /* storage disabled */ }
  if (list.length === 0) return; // stays hidden
  list
    .filter((e) => e && e.sid && e.name)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    .slice(0, 6)
    .forEach((entry) => {
      const a = document.createElement("a");
      a.className = "chip";
      a.href = `/result.html?sid=${encodeURIComponent(entry.sid)}`;
      a.textContent = entry.name;
      host.appendChild(a);
    });
  host.hidden = false;
})();

/* ---------- Submit ---------- */

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (submit.disabled) return;
  hideError();
  const body = manualMode
    ? { shop_name: input.value.trim(),
        parish: (document.getElementById("manual-parish")?.value ?? "").trim() || undefined }
    : { place_id: selected.place_id, shop_name: selected.name };

  // Optimistic — disable while in flight, revert on error.
  submit.disabled = true;
  submit.setAttribute("aria-busy", "true");
  const prevLabel = submit.textContent;
  submit.textContent = "Sim, começar";

  try {
    const { sid } = await startDiagnostic(body);
    try { sessionStorage.setItem(`raiox:${sid}:shop`, body.shop_name); } catch {}
    window.location.href = `/result.html?sid=${encodeURIComponent(sid)}`;
  } catch {
    submit.disabled = false;
    submit.removeAttribute("aria-busy");
    submit.textContent = prevLabel;
    showError("Sem rede agora — toca aqui para tentar de novo.", () => form.requestSubmit());
  }
});
