// Shared helpers — no dependencies, no DOM-specific globals.

export const API_BASE = "https://raiox-api.jd-ad0.workers.dev";

// Mock toggle: set ?mock=1 in URL or localStorage.raiox_mock = "1" to force mocks.
// Without a flag we still fall back to mocks if /api/diagnostic returns 501.
export function mockMode() {
  const url = new URL(window.location.href);
  if (url.searchParams.get("mock") === "1") return true;
  try { return window.localStorage.getItem("raiox_mock") === "1"; } catch { return false; }
}

export const fmt = new Intl.NumberFormat("pt-PT");
export const formatNumber = (n) => fmt.format(n);

export const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function countUp(el, target, duration = 1200) {
  if (prefersReducedMotion() || target <= 0) {
    el.textContent = formatNumber(target);
    return;
  }
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = formatNumber(Math.floor(target * eased));
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = formatNumber(target);
  }
  requestAnimationFrame(step);
}

export function debounce(fn, wait = 250) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Parse a domain out of a URL string (for `site_url` display)
export function domainOnly(u) {
  try { return new URL(u).host.replace(/^www\./, ""); }
  catch { return String(u || ""); }
}

// PT-PT label map for ProgressData → fact card
export function pickFact(data) {
  if (!data || typeof data !== "object") return null;
  // Order matters: more "headline" facts first.
  if (typeof data.reviews_count === "number") {
    return {
      number: formatNumber(data.reviews_count),
      label: typeof data.rating === "number"
        ? `reviews no Google · ${String(data.rating).replace(".", ",")} ★`
        : "reviews no Google",
    };
  }
  if (typeof data.instagram_followers === "number") {
    return { number: formatNumber(data.instagram_followers), label: "seguidores no Instagram" };
  }
  if (typeof data.instagram_posts === "number") {
    return { number: formatNumber(data.instagram_posts), label: "publicações no Instagram" };
  }
  if (typeof data.facebook_followers === "number") {
    return { number: formatNumber(data.facebook_followers), label: "seguidores no Facebook" };
  }
  if (typeof data.last_post_days_ago === "number") {
    return { number: formatNumber(data.last_post_days_ago), label: "dias desde a última publicação" };
  }
  if (typeof data.site_url === "string") {
    return { number: domainOnly(data.site_url), label: "o teu site" };
  }
  if (typeof data.source_found === "string") {
    return { number: data.source_found, label: "mais um sítio onde apareces" };
  }
  if (typeof data.hours_today === "string") {
    return { number: data.hours_today, label: "horário hoje" };
  }
  return null;
}

export function stagePercent(stage) {
  switch (stage) {
    case "identifying":         return 10;
    case "scanning_google":     return 30;
    case "scanning_instagram":  return 50;
    case "scanning_site":       return 65;
    case "scanning_web":        return 80;
    case "synthesizing":        return 95;
    case "done":                return 100;
    default:                    return 6;
  }
}

export const LAB_TITLES = {
  lab_1: "FAQ automática da loja",
  lab_2: "Planeador de campanhas",
  lab_3: "Montra em QR Code",
};
