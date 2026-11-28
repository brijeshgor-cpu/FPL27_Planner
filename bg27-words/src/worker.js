// BG27 WordRush: serves the game and keeps the Daily leaderboard in KV.
// One key per day holds that day's games; weekly and monthly tables total them,
// and "alltime:daily" keeps the ten best single games ever.
import { ANSWERS, EXTRA } from "./words.js";
import { ROWS, LAUNCH, answerFor, weekStart, pointsFor, gameCmp, periodCmp, ranks } from "./logic.js";
import PAGE from "./page.gen.js";

const VALID = new Set([...ANSWERS, ...EXTRA]);
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const utcDay = () => Math.floor(Date.now() / 864e5);
const dayKey = day => `b:daily:${day}`;
const ALLTIME = "alltime:daily";
const TOP = 10;

// Entries saved before points existed get them worked out on read.
const withPts = e => ({ ...e, pts: pointsFor(e.won, e.n) });
const gameSort = (a, b) => gameCmp(a, b) || ((a.t || 0) - (b.t || 0));
const pub = e => ({ name: e.name, n: e.n, won: e.won, s: e.s, pts: e.pts, day: e.day });

async function readDay(env, day) { return ((await env.BG27_WORDS.get(dayKey(day), "json")) || []).map(e => withPts({ ...e, day })); }

// A week or month: total points, then least total time.
async function periodTable(env, first, last) {
  last = Math.min(last, utcDay() + 1);
  const days = [];
  for (let d = Math.max(first, LAUNCH); d <= last; d++) days.push(d);
  const games = (await Promise.all(days.map(d => readDay(env, d)))).flat();
  const by = new Map();
  for (const e of games) {
    const k = e.name.toLowerCase();
    const p = by.get(k) || { name: e.name, played: 0, wins: 0, pts: 0, s: 0 };
    p.played++; if (e.won) p.wins++; p.pts += e.pts; p.s += e.s;
    by.set(k, p);
  }
  return [...by.values()].sort(periodCmp);
}
function monthRange(day) {
  const d = new Date(day * 864e5), y = d.getUTCFullYear(), m = d.getUTCMonth();
  return [Date.UTC(y, m, 1) / 864e5, Date.UTC(y, m + 1, 0) / 864e5];
}

async function allTime(env) {
  const saved = await env.BG27_WORDS.get(ALLTIME, "json");
  if (saved) return saved.map(withPts);
  // First use: build it from every day already stored.
  const keys = [];
  let cursor;
  do { const r = await env.BG27_WORDS.list({ prefix: "b:daily:", cursor }); keys.push(...r.keys.map(k => k.name)); cursor = r.list_complete ? null : r.cursor; } while (cursor);
  const games = (await Promise.all(keys.map(k => readDay(env, Number(k.split(":")[2]))))).flat();
  const top = games.filter(e => e.won).sort(gameSort).slice(0, TOP).map(pub);
  await env.BG27_WORDS.put(ALLTIME, JSON.stringify(top));
  return top;
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
    const day = Number(url.searchParams.get("day"));

    if (req.method === "GET" && url.pathname === "/api/board") {
      if (!Number.isInteger(day)) return json({ error: "Unknown day." }, 400);
      return json({ day, entries: (await readDay(env, day)).sort(gameSort).map(pub) });
    }
    if (req.method === "GET" && url.pathname === "/api/week") {
      if (!Number.isInteger(day)) return json({ error: "Unknown week." }, 400);
      const start = weekStart(day);
      const [entries, prev] = await Promise.all([periodTable(env, start, start + 6), periodTable(env, start - 7, start - 1)]);
      return json({ start, entries, lastWinner: prev[0] && prev[0].pts ? prev[0] : null });
    }
    if (req.method === "GET" && url.pathname === "/api/month") {
      if (!Number.isInteger(day)) return json({ error: "Unknown month." }, 400);
      const [first, last] = monthRange(day), [pf, pl] = monthRange(first - 1);
      const [entries, prev] = await Promise.all([periodTable(env, first, last), periodTable(env, pf, pl)]);
      return json({ first, entries, lastWinner: prev[0] && prev[0].pts ? prev[0] : null });
    }
    if (req.method === "GET" && url.pathname === "/api/alltime") {
      return json({ entries: await allTime(env) });
    }

    if (req.method === "POST" && url.pathname === "/api/score") {
      let b; try { b = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
      const { mode, guesses } = b || {}, d = b && b.day;
      if (mode !== "daily") return json({ error: "Only the Daily word has a leaderboard." }, 400);
      if (!Number.isInteger(d) || d < LAUNCH || Math.abs(d - utcDay()) > 1) return json({ error: "That puzzle isn't open for scores." }, 400);
      const name = String(b.name || "").replace(/[^\p{L}\p{N} _.'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 16);
      if (!name) return json({ error: "Pick a nickname using letters and numbers." }, 400);
      const ans = answerFor("daily", d);
      if (!Array.isArray(guesses) || guesses.length < 1 || guesses.length > ROWS) return json({ error: "Bad guesses." }, 400);
      for (const g of guesses) if (typeof g !== "string" || g.length !== ans.length || !/^[a-z]+$/.test(g) || !VALID.has(g)) return json({ error: "Bad guesses." }, 400);
      const hitAt = guesses.indexOf(ans), won = hitAt === guesses.length - 1;
      if (!won && (hitAt !== -1 || guesses.length !== ROWS)) return json({ error: "Bad guesses." }, 400);
      const s = Math.min(86400, Math.max(1, Math.round(Number(b.seconds) || 0)));

      const raw = (await env.BG27_WORDS.get(dayKey(d), "json")) || [];
      if (raw.some(e => e.name.toLowerCase() === name.toLowerCase())) return json({ error: `"${name}" has already posted today. Pick another nickname.` }, 409);
      if (raw.length >= 500) return json({ error: "Today's board is full." }, 429);
      const entry = { name, n: guesses.length, won, s, t: Date.now(), pts: pointsFor(won, guesses.length) };
      const top = await allTime(env); // read before saving today's entry, so a first build can't count it twice
      raw.push(entry);
      await env.BG27_WORDS.put(dayKey(d), JSON.stringify(raw), { expirationTtl: 400 * 864e2 });

      const full = { ...entry, day: d };
      if (won && (top.length < TOP || gameSort(full, top[top.length - 1]) < 0)) {
        top.push(pub(full)); top.sort(gameCmp);
        await env.BG27_WORDS.put(ALLTIME, JSON.stringify(top.slice(0, TOP)));
      }
      const today = raw.map(withPts).sort(gameSort), rk = ranks(today, gameCmp);
      return json({ ok: true, name, pts: entry.pts, rank: rk[today.findIndex(e => e.t === entry.t && e.name === name)], total: today.length });
    }
    return new Response("Not found", { status: 404 });
  },
};
