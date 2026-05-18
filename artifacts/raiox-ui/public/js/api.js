// Typed API client. Falls back to local mock data when the live endpoint
// returns 501 (not yet implemented) or when ?mock=1 is set.

import { API_BASE, RESULT_API_BASE, mockMode } from "/js/util.js";
import { MOCK_PREDICTIONS, mockStartDiagnostic, mockStatus, mockResult } from "/js/mock.js";

async function jsonFetch(path, init) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "accept": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  return res;
}

// Used only for the Task #10 endpoints which live on our own api-server
// (RESULT_API_BASE), not the workers.dev diagnostic backend (API_BASE).
async function resultFetch(path, init) {
  const res = await fetch(`${RESULT_API_BASE}${path}`, {
    headers: { "accept": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  return res;
}

export async function autocomplete(q, parish) {
  if (!q || q.trim().length < 2) return { predictions: [] };
  if (mockMode()) return filterMock(q);
  try {
    const url = new URL(`${API_BASE}/api/autocomplete`);
    url.searchParams.set("q", q);
    if (parish) url.searchParams.set("parish", parish);
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      if (res.status === 501) return filterMock(q);
      throw new Error(`autocomplete ${res.status}`);
    }
    const data = await res.json();
    // If the live API returns no matches, merge in any mock fixture matches so
    // the demo shops (Casa Januário etc.) are always reachable by typing.
    if (!data?.predictions || data.predictions.length === 0) {
      const mock = filterMock(q);
      if (mock.predictions.length > 0) return mock;
    }
    return data;
  } catch (err) {
    // Network failure: don't blow up the page if the demo shops can satisfy the query.
    const mock = filterMock(q);
    if (mock.predictions.length > 0) return mock;
    throw err;
  }
}

function filterMock(q) {
  const needle = q.trim().toLowerCase();
  const predictions = MOCK_PREDICTIONS.filter((p) =>
    p.name.toLowerCase().includes(needle) || p.address.toLowerCase().includes(needle)
  );
  return { predictions };
}

export async function startDiagnostic(body) {
  if (mockMode()) {
    const sid = newSid();
    return mockStartDiagnostic(sid);
  }
  const res = await jsonFetch(`/api/diagnostic`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 501) {
    // API team hasn't shipped this endpoint yet — fall through to mock.
    const sid = newSid();
    return mockStartDiagnostic(sid);
  }
  if (!res.ok) throw new Error(`diagnostic ${res.status}`);
  return await res.json();
}

export async function getStatus(sid) {
  if (mockMode()) return mockStatus(sid);
  const res = await jsonFetch(`/api/status?sid=${encodeURIComponent(sid)}`);
  // Brief: only 501 (endpoint not yet implemented) falls back to mock.
  // 404 means a real expired/unknown sid and must surface as an error.
  if (res.status === 501) return mockStatus(sid);
  if (!res.ok) throw new Error(`status ${res.status}`);
  return await res.json();
}

export async function getResult(sid) {
  if (mockMode()) return mockResult();
  const res = await jsonFetch(`/api/result/${encodeURIComponent(sid)}`);
  if (res.status === 501) return mockResult();
  if (!res.ok) throw new Error(`result ${res.status}`);
  return await res.json();
}

// Locked share text from the brief's translation table — used verbatim.
// Brief rule 8 permits up to one emoji here; the locked table contains none,
// so we ship the table copy as-is and defer any emoji decision to JD's review.
const SHARE_TEXT_TEMPLATE = (url) =>
  `Acabei de fazer um raio-x digital da minha loja em 90 seg. Toma o teu: ${url} — AHI`;

export function shareWhatsappUrl(shareUrl) {
  return `https://wa.me/?text=${encodeURIComponent(SHARE_TEXT_TEMPLATE(shareUrl))}`;
}

// Server-prepared WhatsApp URL per brief (GET /api/share). Falls back to the
// locally-constructed wa.me link when the endpoint is not yet live.
export async function getShareUrl(sid) {
  if (mockMode()) return shareWhatsappUrl(publicShareUrl(sid));
  try {
    const res = await jsonFetch(`/api/share?sid=${encodeURIComponent(sid)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.url === "string" && data.url.length > 0) return data.url;
    }
  } catch { /* fall through */ }
  return shareWhatsappUrl(publicShareUrl(sid));
}

export function icsUrl(sid, lab) {
  const labNum = lab.replace(/^lab_/, "");
  return `${API_BASE}/api/ics?sid=${encodeURIComponent(sid)}&lab=${encodeURIComponent(labNum)}`;
}

// Brief locks the production share host as raiox.j24d.com. In dev/preview we use
// window.location.origin so the link a developer copies actually resolves.
const PROD_SHARE_ORIGIN = "https://raiox.j24d.com";
export function publicShareUrl(sid) {
  let origin = PROD_SHARE_ORIGIN;
  try {
    const here = window.location.origin;
    if (here && !/raiox\.j24d\.com$/.test(new URL(here).hostname)) origin = here;
  } catch { /* keep prod origin */ }
  return `${origin}/r/${encodeURIComponent(sid)}`;
}

// --- Result email capture (Task #10) ---------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value) {
  return typeof value === "string" && EMAIL_RE.test(value.trim());
}

// POST /api/result/:sid/email — stores the email and either sends the result
// link via Resend (immediate=true) or queues it until the result is ready.
// Returns { ok, sent?, queued? } on success, throws on network/HTTP errors.
export async function submitResultEmail(sid, email, { immediate = false, shopName } = {}) {
  if (!sid) throw new Error("missing_sid");
  if (!isValidEmail(email)) throw new Error("invalid_email");
  const res = await resultFetch(`/api/result/${encodeURIComponent(sid)}/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: String(email).trim(),
      immediate: !!immediate,
      ...(shopName ? { shopName } : {}),
    }),
  });
  if (!res.ok) throw new Error(`email ${res.status}`);
  return await res.json();
}

// POST /api/result/:sid/email/dispatch — flush any queued email after the
// diagnostic completes. Safe to call even when no email was captured.
export async function dispatchResultEmail(sid, { shopName } = {}) {
  if (!sid) return { ok: false };
  try {
    const res = await resultFetch(`/api/result/${encodeURIComponent(sid)}/email/dispatch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(shopName ? { shopName } : {}),
    });
    if (!res.ok) return { ok: false };
    return await res.json();
  } catch {
    return { ok: false };
  }
}

// --- Cached result storage (recover instantly when shared) ----------------

// POST /api/result/:sid/cache — persists the full diagnostic payload so the
// share link can be re-served with no diagnostic re-run.
export async function cacheResult(sid, payload, { shopName } = {}) {
  if (!sid || !payload) return { ok: false };
  try {
    const res = await resultFetch(`/api/result/${encodeURIComponent(sid)}/cache`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload, ...(shopName ? { shopName } : {}) }),
    });
    if (!res.ok) return { ok: false };
    return await res.json();
  } catch {
    return { ok: false };
  }
}

// GET /api/result/:sid/cache — returns { sid, shopName, payload, cachedAt }
// or null when the sid is unknown / cache lookup fails.
export async function getCachedResult(sid) {
  if (!sid) return null;
  try {
    const res = await resultFetch(`/api/result/${encodeURIComponent(sid)}/cache`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function newSid() {
  // Mock-only: stable enough for a single session.
  return "mock_" + Math.random().toString(36).slice(2, 10);
}
