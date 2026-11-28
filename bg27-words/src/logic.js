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

// Category hints are kept a little vague; Kids zone shows its plain topic name.
const VAGUE = {
 "Football club": "A team",
 "Football player": "A famous name",
 "Football term": "You'd hear it during a match",
 "Football ground": "A famous place",
 "Football kit or fan gear": "Something you wear",
 "Film title": "One you might have seen",
 "Animated film": "A family favourite",
 "Film-making term": "In front of or behind the camera",
 "Film genre": "A kind of film",
 "Film award": "Winners take it home",
 "Cinema snack": "Something to munch on",
 "Capital city": "An important city",
 "World city": "A big city",
 "Country": "It has its own flag",
 "UK nation": "Close to home",
 "River": "It flows",
 "Mountain or mountain range": "Somewhere high up",
 "Desert": "Somewhere very dry",
 "Natural feature": "Shaped by nature",
 "Line on the globe": "An imaginary line",
 "Weather system": "Ask a weather forecaster",
 "English county": "Somewhere in England",
 "English city": "A historic place in England",
 "Sportswear brand": "Look at your trainers",
 "Luxury fashion house": "Very pricey",
 "Watch brand": "Worn on the wrist",
 "Clothing brand": "In your wardrobe",
 "Footwear brand": "Think feet",
 "Supermarket": "The weekly shop",
 "High-street shop": "On the high street",
 "Food and coffee chain": "Grab a bite",
 "Tech company": "On your phone or computer",
 "Toy brand": "Kids love it",
 "Furniture shop": "For your home",
 "Chocolate or biscuit": "A sweet treat",
 "Crisp brand": "A savoury snack",
 "Food brand": "In the kitchen cupboard",
 "Soft drink": "Something to sip",
 "Cleaning brand": "Under the sink",
 "Home appliance brand": "Plugs in at home",
 "Car maker": "On the road",
 "Fuel company": "At the pump",
 "Travel company": "Gets you places",
 "Bank or payments": "To do with money",
 "Toiletries brand": "In the bathroom"
};
export function topicFor(mode, word) {
  for (const [topic, words] of Object.entries(HINTS[mode] || {})) if (words.split(" ").includes(word)) return topic;
  return "";
}
export function hintFor(mode, word) { const t = topicFor(mode, word); return mode === "kids" ? t : (VAGUE[t] || t); }
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
