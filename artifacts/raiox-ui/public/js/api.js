// Typed API client. Falls back to local mock data when the live endpoint
// returns 501 (not yet implemented) or when ?mock=1 is set.

import { API_BASE, mockMode } from "/js/util.js";
import { MOCK_PREDICTIONS, mockStartDiagnostic, mockStatus, mockResult } from "/js/mock.js";

async function jsonFetch(path, init) {
  const res = await fetch(`${API_BASE}${path}`, {
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
    return await res.json();
  } catch (err) {
    // Surface as a network error to the caller. Caller decides whether to retry/mock.
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
  if (res.status === 501 || res.status === 404) return mockStatus(sid);
  if (!res.ok) throw new Error(`status ${res.status}`);
  return await res.json();
}

export async function getResult(sid) {
  if (mockMode()) return mockResult();
  const res = await jsonFetch(`/api/result/${encodeURIComponent(sid)}`);
  if (res.status === 501 || res.status === 404) return mockResult();
  if (!res.ok) throw new Error(`result ${res.status}`);
  return await res.json();
}

// Brief locks one (and only one) emoji in the WhatsApp message.
const SHARE_TEXT_TEMPLATE = (url) =>
  `🔍 Acabei de fazer um raio-x digital da minha loja em 90 seg. Toma o teu: ${url} — AHI`;

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

export function publicShareUrl(sid) {
  // Public link the merchant pastes anywhere. Production hostname per brief.
  return `https://raiox.j24d.com/r/${encodeURIComponent(sid)}`;
}

function newSid() {
  // Mock-only: stable enough for a single session.
  return "mock_" + Math.random().toString(36).slice(2, 10);
}
