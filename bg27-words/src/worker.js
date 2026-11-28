// BG27 WordRush: serves the game and keeps the Daily leaderboard in KV (one key per day, totalled per week).
import { ANSWERS, EXTRA } from "./words.js";
import { MODES, ROWS, LAUNCH, answerFor, weekStart } from "./logic.js";
import PAGE from "./page.gen.js";

const VALID = new Set([...ANSWERS, ...EXTRA]);
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const rankSort = (a, b) => (b.won - a.won) || (a.n - b.n) || (a.s - b.s) || (a.t - b.t);
const utcDay = () => Math.floor(Date.now() / 864e5);
const key = (mode, day) => `b:${mode}:${day}`;

async function readBoard(env, mode, day) { return (await env.BG27_WORDS.get(key(mode, day), "json")) || []; }

// A week's table: wins first, then fewest guesses (a loss counts as 7), then least time.
async function weekTable(env, start) {
  const last = Math.min(start + 6, utcDay() + 1);
  const days = [];
  for (let d = start; d <= last; d++) days.push(d);
  const boards = await Promise.all(days.map(d => readBoard(env, "daily", d)));
  const by = new Map();
  boards.flat().forEach(e => {
    const k = e.name.toLowerCase();
    const p = by.get(k) || { name: e.name, played: 0, wins: 0, g: 0, s: 0 };
    p.played++; if (e.won) p.wins++; p.g += e.won ? e.n : 7; p.s += e.s;
    by.set(k, p);
  });
  return [...by.values()].sort((a, b) => (b.wins - a.wins) || (a.g / a.played - b.g / b.played) || (b.played - a.played) || (a.s - b.s));
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    // The game was renamed: send the old address to the new one.
    if (url.hostname.startsWith("bg27-words.")) {
      url.hostname = url.hostname.replace("bg27-words.", "bg27-wordrush.");
      return Response.redirect(url.toString(), 308);
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
    }
    if (url.pathname === "/api/board" && req.method === "GET") {
      const mode = url.searchParams.get("mode"), day = Number(url.searchParams.get("day"));
      if (mode !== "daily") return json({ error: "Only the Daily word has a leaderboard." }, 400);
      if (!MODES.includes(mode) || !Number.isInteger(day)) return json({ error: "Unknown board." }, 400);
      const entries = (await readBoard(env, mode, day)).sort(rankSort).map(({ name, n, won, s }) => ({ name, n, won, s }));
      return json({ mode, day, entries });
    }
    if (url.pathname === "/api/week" && req.method === "GET") {
      const day = Number(url.searchParams.get("day"));
      if (!Number.isInteger(day)) return json({ error: "Unknown week." }, 400);
      const start = weekStart(day);
      const [entries, prev] = await Promise.all([weekTable(env, start), weekTable(env, start - 7)]);
      return json({ start, entries, lastWinner: prev[0] && prev[0].wins ? prev[0] : null });
    }
    if (url.pathname === "/api/score" && req.method === "POST") {
      let b; try { b = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
      const { mode, day, guesses } = b || {};
      if (mode !== "daily") return json({ error: "Only the Daily word has a leaderboard." }, 400);
      if (!MODES.includes(mode) || !Number.isInteger(day) || day < LAUNCH || Math.abs(day - utcDay()) > 1) return json({ error: "That puzzle isn't open for scores." }, 400);
      const name = String(b.name || "").replace(/[^\p{L}\p{N} _.'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 16);
      if (!name) return json({ error: "Pick a nickname using letters and numbers." }, 400);
      const ans = answerFor(mode, day);
      if (!Array.isArray(guesses) || guesses.length < 1 || guesses.length > ROWS) return json({ error: "Bad guesses." }, 400);
      for (const g of guesses) {
        if (typeof g !== "string" || g.length !== ans.length || !/^[a-z]+$/.test(g)) return json({ error: "Bad guesses." }, 400);
        if (mode === "daily" && !VALID.has(g)) return json({ error: "Bad guesses." }, 400);
      }
      const hitAt = guesses.indexOf(ans);
      const won = hitAt === guesses.length - 1;
      if (!won && (hitAt !== -1 || guesses.length !== ROWS)) return json({ error: "Bad guesses." }, 400);
      const s = Math.min(86400, Math.max(1, Math.round(Number(b.seconds) || 0)));
      const list = await readBoard(env, mode, day);
      if (list.some(e => e.name.toLowerCase() === name.toLowerCase())) return json({ error: `"${name}" has already posted today. Pick another nickname.` }, 409);
      if (list.length >= 500) return json({ error: "Today's board is full." }, 429);
      const entry = { name, n: guesses.length, won, s, t: Date.now() };
      list.push(entry); list.sort(rankSort);
      await env.BG27_WORDS.put(key(mode, day), JSON.stringify(list), { expirationTtl: 60 * 864e2 });
      return json({ ok: true, name, rank: list.indexOf(entry) + 1, total: list.length });
    }
    return new Response("Not found", { status: 404 });
  },
};
