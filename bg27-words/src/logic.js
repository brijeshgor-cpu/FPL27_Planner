import { ANSWERS, CATS, HINTS } from "./words.js";
// Shared by the page and the Worker: which word is the answer on a given day.
export const LAUNCH = Date.UTC(2026, 10, 28) / 864e5; // 28 Nov 2026 is puzzle #1
export const ROWS = 6;
export const MODES = ["daily", "football", "movies", "geography", "brands", "kids"];
export const CATEGORIES = MODES.slice(1);
export const MODE_NAMES = { daily: "Daily", football: "Football", movies: "Movies", geography: "Geography", brands: "Brands", kids: "Kids zone" };

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffle(list, seed) { const o = list.slice(), r = rng(seed); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; }

const ORDERS = {};
export function orderFor(mode) {
  if (ORDERS[mode]) return ORDERS[mode];
  let o;
  if (mode === "daily") {
    o = shuffle(ANSWERS, 2027);
    // Puzzle #1 went out before the UK word list; keep it so earlier games still score.
    const i = o.indexOf("story"); if (i > 0) { o.splice(i, 1); o.unshift("story"); }
  } else {
    o = shuffle(CATS[mode].split(" "), 2027 + MODES.indexOf(mode) * 101);
    // Kids zone puzzle #1 went out before the easier list; keep it so earlier games still score.
    if (mode === "kids") { const i = o.indexOf("dragon"); if (i > 0) { o.splice(i, 1); o.unshift("dragon"); } }
  }
  return ORDERS[mode] = o;
}
export function answerFor(mode, day) { const o = orderFor(mode); return o[((day - LAUNCH) % o.length + o.length) % o.length]; }

export function score(guess, answer) {
  const n = answer.length, res = Array(n).fill("miss"), left = {};
  for (let i = 0; i < n; i++) { if (guess[i] === answer[i]) res[i] = "hit"; else left[answer[i]] = (left[answer[i]] || 0) + 1; }
  for (let i = 0; i < n; i++) { if (res[i] !== "hit" && left[guess[i]]) { res[i] = "near"; left[guess[i]]--; } }
  return res;
}

export function hintFor(mode, word) {
  for (const [hint, words] of Object.entries(HINTS[mode] || {})) if (words.split(" ").includes(word)) return hint;
  return "";
}
// Weeks run Monday to Sunday (UK). Day numbers are days since 1 Jan 1970.
export function weekStart(day) { const dow = new Date(day * 864e5).getUTCDay(); return day - ((dow + 6) % 7); }

// Daily points: 600 for one guess down to 100 for six, 0 for a miss.
export const BASE_POINTS = [600, 500, 400, 300, 200, 100];
export function pointsFor(won, n) { return won ? BASE_POINTS[n - 1] : 0; }
// Games rank by fewest guesses (a miss is last), then fastest time. Identical results share a rank.
export function gameCmp(a, b) { return ((a.won ? a.n : 7) - (b.won ? b.n : 7)) || (a.s - b.s); }
// Weeks and months rank by total points, then least total time.
export function periodCmp(a, b) { return (b.pts - a.pts) || (a.s - b.s); }
// Rank numbers with ties sharing a place (1, 2, 2, 4).
export function ranks(list, cmp) { const r = []; list.forEach((e, i) => r.push(i && cmp(list[i - 1], e) === 0 ? r[i - 1] : i + 1)); return r; }
