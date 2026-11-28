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

// ---- Nicknames: claimed by a device key, no login ----
// nick:<name> holds the SHA-256 of each linked device's key. xfer:<code> is a 15-minute link code.
const nickKey = n => `nick:${n.toLowerCase()}`;
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const hex = a => [...a].map(x => x.toString(16).padStart(2, "0")).join("");
async function sha(s) { return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))); }
function newKey() { const a = new Uint8Array(16); crypto.getRandomValues(a); return hex(a); }
function newCode() { const a = new Uint8Array(8); crypto.getRandomValues(a); const s = [...a].map(x => CODE_CHARS[x % CODE_CHARS.length]).join(""); return s.slice(0, 4) + "-" + s.slice(4); }
async function ownsNick(env, name, key) {
  const c = await env.BG27_WORDS.get(nickKey(name), "json");
  return !!(c && key && c.hs.includes(await sha(String(key))));
}

// ---- Player stats ----
// p:<name> holds a player's posted Daily games; "players" indexes every player's total points
// (plus the day and points of their latest game, so yesterday's ranking can be worked out).
const pKey = n => `p:${n.toLowerCase()}`;
async function playerIndex(env) {
  const saved = await env.BG27_WORDS.get("players", "json");
  if (saved) return saved;
  // First use: build from every day already stored.
  const keys = [];
  let cursor;
  do { const r = await env.BG27_WORDS.list({ prefix: "b:daily:", cursor }); keys.push(...r.keys.map(k => k.name)); cursor = r.list_complete ? null : r.cursor; } while (cursor);
  const docs = {};
  for (const k of keys) {
    const d = Number(k.split(":")[2]);
    for (const e of await readDay(env, d)) {
      const id = e.name.toLowerCase();
      (docs[id] ||= { name: e.name, games: [] }).games.push({ d, n: e.n, won: e.won, s: e.s, pts: e.pts });
    }
  }
  const idx = {};
  for (const [id, doc] of Object.entries(docs)) {
    doc.games.sort((a, b) => a.d - b.d);
    const last = doc.games[doc.games.length - 1];
    idx[id] = { name: doc.name, pts: doc.games.reduce((t, g) => t + g.pts, 0), d: last.d, dp: last.pts };
    await env.BG27_WORDS.put(pKey(id), JSON.stringify(doc));
  }
  await env.BG27_WORDS.put("players", JSON.stringify(idx));
  return idx;
}
async function recordGame(env, idx, name, game) {
  const id = name.toLowerCase();
  const doc = (await env.BG27_WORDS.get(pKey(id), "json")) || { name, games: [] };
  if (!doc.games.some(g => g.d === game.d)) doc.games.push(game);
  doc.games.sort((a, b) => a.d - b.d);
  await env.BG27_WORDS.put(pKey(id), JSON.stringify(doc));
  idx[id] = { name, pts: doc.games.reduce((t, g) => t + g.pts, 0), d: game.d, dp: game.pts };
  await env.BG27_WORDS.put("players", JSON.stringify(idx));
}
function playerStats(doc, idx, today) {
  const g = doc.games, wins = g.filter(x => x.won), dist = [0, 0, 0, 0, 0, 0];
  wins.forEach(x => dist[x.n - 1]++);
  const won = new Set(wins.map(x => x.d));
  let longest = 0, run = 0, prev = null;
  for (const x of g) { if (x.won) { run = prev !== null && x.d === prev + 1 && run ? run + 1 : 1; prev = x.d; longest = Math.max(longest, run); } else { run = 0; prev = null; } }
  let current = 0, d = won.has(today) ? today : today - 1;
  while (won.has(d)) { current++; d--; }
  const id = doc.name.toLowerCase(), all = Object.values(idx), me = idx[id];
  const total = me ? me.pts : 0;
  const rank = 1 + all.filter(p => p.pts > total).length;
  // Yesterday's ranking: take away points from games played today.
  const before = p => p.pts - (p.d === today ? p.dp : 0);
  const playedBefore = g.some(x => x.d < today);
  const prevPool = all.filter(p => before(p) > 0 || p === me);
  const prevRank = 1 + prevPool.filter(p => before(p) > before(me || { pts: 0 })).length;
  const best = wins.slice().sort((a, b) => (a.n - b.n) || (a.s - b.s))[0] || null;
  return {
    name: doc.name, played: g.length, wins: wins.length,
    winRate: g.length ? Math.round(wins.length / g.length * 100) : 0,
    avgGuesses: wins.length ? Math.round(wins.reduce((t, x) => t + x.n, 0) / wins.length * 10) / 10 : null,
    current, longest, points: total, rank, players: all.length,
    rankChange: playedBefore ? prevRank - rank : null, dist,
    best: best && { n: best.n, s: best.s, d: best.d },
    recent: g.slice(-7).map(x => ({ d: x.d, n: x.n, won: x.won, pts: x.pts })),
  };
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
    if (req.method === "GET" && url.pathname === "/api/player") {
      const name = String(url.searchParams.get("name") || "").slice(0, 32);
      const idx = await playerIndex(env);
      const doc = name && await env.BG27_WORDS.get(pKey(name), "json");
      if (!doc) return json({ error: "No Daily scores for that nickname yet." }, 404);
      return json(playerStats(doc, idx, Number.isInteger(day) ? day : utcDay()));
    }
    if (req.method === "POST" && url.pathname === "/api/transfer") {
      let b; try { b = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
      if (!(await ownsNick(env, String(b.name || ""), b.key))) return json({ error: "This device doesn't own that nickname." }, 403);
      const code = newCode();
      await env.BG27_WORDS.put(`xfer:${code}`, JSON.stringify({ name: (await env.BG27_WORDS.get(nickKey(b.name), "json")).name }), { expirationTtl: 900 });
      return json({ code, minutes: 15 });
    }
    if (req.method === "POST" && url.pathname === "/api/link") {
      let b; try { b = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
      const code = String(b.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^(.{4})(.{4})$/, "$1-$2");
      const x = await env.BG27_WORDS.get(`xfer:${code}`, "json");
      if (!x) return json({ error: "That code isn't valid or has expired. Make a new one on your other device." }, 404);
      await env.BG27_WORDS.delete(`xfer:${code}`);
      const c = await env.BG27_WORDS.get(nickKey(x.name), "json");
      const key = newKey();
      c.hs = [...c.hs, await sha(key)].slice(-6);
      await env.BG27_WORDS.put(nickKey(x.name), JSON.stringify(c));
      return json({ name: c.name, key });
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

      // The first device to post with a nickname claims it; after that it needs that device's key.
      const claim = await env.BG27_WORDS.get(nickKey(name), "json");
      let issuedKey = null;
      if (claim) {
        if (!b.key || !claim.hs.includes(await sha(String(b.key)))) return json({ error: `"${name}" belongs to another player. Pick another nickname, or if it's yours, link this device with a code from your other device.`, claimed: true }, 403);
      }
      const raw = (await env.BG27_WORDS.get(dayKey(d), "json")) || [];
      if (raw.some(e => e.name.toLowerCase() === name.toLowerCase())) return json({ error: `You've already posted today's score as "${name}".`, already: true }, 409);
      if (raw.length >= 500) return json({ error: "Today's board is full." }, 429);
      const entry = { name, n: guesses.length, won, s, t: Date.now(), pts: pointsFor(won, guesses.length) };
      if (!claim) { issuedKey = newKey(); await env.BG27_WORDS.put(nickKey(name), JSON.stringify({ name, hs: [await sha(issuedKey)], at: Date.now() })); }
      const top = await allTime(env); // read before saving today's entry, so a first build can't count it twice
      const idx = await playerIndex(env);
      raw.push(entry);
      await env.BG27_WORDS.put(dayKey(d), JSON.stringify(raw), { expirationTtl: 400 * 864e2 });

      const full = { ...entry, day: d };
      if (won && (top.length < TOP || gameSort(full, top[top.length - 1]) < 0)) {
        top.push(pub(full)); top.sort(gameCmp);
        await env.BG27_WORDS.put(ALLTIME, JSON.stringify(top.slice(0, TOP)));
      }
      await recordGame(env, idx, name, { d, n: entry.n, won, s, pts: entry.pts });
      const today = raw.map(withPts).sort(gameSort), rk = ranks(today, gameCmp);
      return json({ ok: true, name, key: issuedKey, pts: entry.pts, rank: rk[today.findIndex(e => e.t === entry.t && e.name === name)], total: today.length });
    }
    return new Response("Not found", { status: 404 });
  },
};
