// SVG tile motifs — abstract azulejo language (NOT a real Porto tile pattern).
// Used in the 3×3 waiting grid, hero scene, and discovery cells.

const COBALT = "#1d3f7a";
const TERRACOTTA = "#c66339";

const PATTERNS = [
  // 0 — quarter-circles
  `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect width="64" height="64" fill="#fff"/>
    <path d="M0 32 A32 32 0 0 1 32 0" stroke="${COBALT}" stroke-width="3" fill="none"/>
    <path d="M32 64 A32 32 0 0 1 64 32" stroke="${COBALT}" stroke-width="3" fill="none"/>
    <circle cx="32" cy="32" r="4" fill="${TERRACOTTA}"/>
  </svg>`,
  // 1 — diamond grid
  `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect width="64" height="64" fill="#fff"/>
    <path d="M32 6 L58 32 L32 58 L6 32 Z" stroke="${COBALT}" stroke-width="2" fill="none"/>
    <path d="M32 18 L46 32 L32 46 L18 32 Z" fill="${COBALT}" opacity="0.18"/>
  </svg>`,
  // 2 — dotted cross
  `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect width="64" height="64" fill="#fff"/>
    <line x1="32" y1="6" x2="32" y2="58" stroke="${COBALT}" stroke-width="1.5" stroke-dasharray="2 3"/>
    <line x1="6" y1="32" x2="58" y2="32" stroke="${COBALT}" stroke-width="1.5" stroke-dasharray="2 3"/>
    <circle cx="32" cy="32" r="6" fill="none" stroke="${TERRACOTTA}" stroke-width="2"/>
  </svg>`,
  // 3 — diagonal stripes
  `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect width="64" height="64" fill="#fff"/>
    <line x1="0"  y1="0" x2="-32" y2="64" stroke="${COBALT}" stroke-width="1.5" opacity="0.5"/>
    <line x1="16" y1="0" x2="-16" y2="64" stroke="${COBALT}" stroke-width="1.5" opacity="0.5"/>
    <line x1="32" y1="0" x2="0"   y2="64" stroke="${COBALT}" stroke-width="1.5" opacity="0.5"/>
    <line x1="48" y1="0" x2="16"  y2="64" stroke="${COBALT}" stroke-width="1.5" opacity="0.5"/>
    <line x1="64" y1="0" x2="32"  y2="64" stroke="${COBALT}" stroke-width="1.5" opacity="0.5"/>
    <rect x="22" y="22" width="20" height="20" fill="${TERRACOTTA}" opacity="0.85"/>
  </svg>`,
];

export function tileMotif(kind = 0) {
  return PATTERNS[kind % PATTERNS.length];
}

/**
 * Build the 9-cell waiting grid into `host`.
 * @param {HTMLElement} host
 * @returns {{ lightUp:(n:number)=>void, total:number }}
 */
export function buildTileGrid(host) {
  host.innerHTML = "";
  const cells = [];
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement("div");
    cell.className = "tile";
    cell.style.setProperty("--tile-delay", `${(i % 9) * 0.18}s`);
    cell.innerHTML = tileMotif(i % 4);
    host.appendChild(cell);
    cells.push(cell);
  }
  return {
    total: 9,
    lightUp(n) {
      const lit = Math.max(0, Math.min(9, n));
      cells.forEach((c, i) => {
        const wasLit = c.classList.contains("lit");
        const shouldLit = i < lit;
        if (shouldLit && !wasLit) {
          c.classList.add("lit");
          c.classList.add("pop");
          setTimeout(() => c.classList.remove("pop"), 700);
        } else if (!shouldLit && wasLit) {
          c.classList.remove("lit");
        }
      });
    },
  };
}
