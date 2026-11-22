// FC27 Planner on Cloudflare Workers.
// Serves the page (bundled from ./worker/public at deploy time) and passes a fixed set of read-only
// FPL API requests through /api/*, so the page can load live data on every visit.
// (The FPL API does not allow browsers to call it directly.)

import PAGE from "../public/index.html";
import SNAPSHOT from "../public/data.json.txt";

const FPL = "https://fantasy.premierleague.com/api/";
const ALLOWED = [
  /^bootstrap-static\/$/,
  /^fixtures\/$/,
  /^entry\/\d+\/$/,
  /^entry\/\d+\/history\/$/,
  /^entry\/\d+\/transfers\/$/,
  /^entry\/\d+\/event\/\d+\/picks\/$/,
  /^leagues-classic\/\d+\/standings\/$/,
  /^event\/\d+\/live\/$/,
  /^element-summary\/\d+\/$/,
];

export default {
  // Hourly cron (see wrangler.toml): refresh the odds as soon as a refresh point has passed.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(odds(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const kit = /^\/kit\/(\d{1,3})(_1)?\.png$/.exec(url.pathname);
    if (kit) return kitImage(kit[1], kit[2] || "");
    if (!url.pathname.startsWith("/api/")) return serveStatic(url.pathname);
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });

    const path = url.pathname.slice("/api/".length);
    if (path === "odds" || path === "odds/") return odds(env);
    if (path === "news" || path === "news/") return news();
    const lp = /^league-picks\/(\d+)\/(\d+)\/?$/.exec(path);
    if (lp) return leaguePicks(env, Number(lp[1]), Number(lp[2]));
    if (!ALLOWED.some((re) => re.test(path))) return json({ error: "not allowed" }, 404);

    const page = url.searchParams.get("page_standings");
    const target = FPL + path + (page && /^\d+$/.test(page) ? `?page_standings=${page}` : "");
    // Nothing from FPL is cached here: every page load fetches fresh data.

    let upstream;
    try {
      upstream = await fetch(target, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; fc27-planner)", Accept: "application/json" },
        cf: { cacheTtl: 0, cacheEverything: false },
      });
    } catch (e) {
      return json({ error: "FPL unreachable" }, 502);
    }
    const headers = new Headers({
      "content-type": upstream.headers.get("content-type") || "application/json",
      "cache-control": "no-store",
    });
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

function serveStatic(path) {
  if (path === "/" || path === "/index.html")
    return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
  if (path === "/data.json")
    return new Response(SNAPSHOT, { headers: { "content-type": "application/json", "cache-control": "no-cache" } });
  if (path === "/robots.txt") return new Response("User-agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain" } });
  return new Response("Not found", { status: 404 });
}

// ---------- bookmaker odds ----------
// Source: The Odds API (the-odds-api.com), Premier League, UK bookmakers, 1X2 + over/under totals.
// Odds are refreshed twice per gameweek: 3 days and 1 day before the next deadline
// (each refresh costs 2 credits, so about 4 credits a gameweek). Results are kept in KV.
const ODDS_URL = "https://api.the-odds-api.com/v4/sports/soccer_epl/odds/";
const DAY = 24 * 3600 * 1000;
const REFRESH_POINTS = [3, 1]; // days before the deadline

// Next FPL deadline. FPL sets each deadline 90 minutes before the gameweek's first kickoff.
async function nextDeadline(env) {
  const c = env.ODDS ? await env.ODDS.get("deadlines", "json") : null;
  let list = c && Date.now() - c.at < 12 * 3600 * 1000 ? c.list : null;
  if (!list) {
    const r = await fetch(FPL + "fixtures/", { headers: { "User-Agent": "Mozilla/5.0 (compatible; fc27-planner)", Accept: "application/json" } });
    if (!r.ok) throw new Error("fixtures " + r.status);
    const first = {};
    for (const f of await r.json()) {
      if (!f.event || !f.kickoff_time) continue;
      const t = Date.parse(f.kickoff_time);
      if (!first[f.event] || t < first[f.event]) first[f.event] = t;
    }
    list = Object.entries(first).map(([gw, t]) => [Number(gw), t - 90 * 60 * 1000]).sort((a, b) => a[1] - b[1]);
    if (env.ODDS) await env.ODDS.put("deadlines", JSON.stringify({ at: Date.now(), list }));
  }
  const n = list.find(([, d]) => d > Date.now());
  return n ? { gw: n[0], deadline: n[1] } : null;
}

function refreshPlan(dl) {
  if (!dl) return { due: null, next: null };
  const now = Date.now();
  const points = REFRESH_POINTS.map((days) => ({ days, at: dl.deadline - days * DAY }));
  const passed = points.filter((p) => p.at <= now);
  return { due: passed.length ? passed[passed.length - 1].at : null, next: points.find((p) => p.at > now) || null };
}

async function odds(env) {
  if (!env.ODDS_API_KEY) return json({ error: "not_configured" }, 503);
  const cached = env.ODDS ? await env.ODDS.get("epl", "json") : null;
  let dl = null;
  try { dl = await nextDeadline(env); } catch (e) { /* keep going with what we have */ }
  const plan = refreshPlan(dl);
  const meta = { gw: dl?.gw ?? null, deadline: dl?.deadline ?? null, nextRefresh: plan.next };
  // Fetch when there is nothing stored yet, or a refresh point has passed since the last fetch.
  const stale = !cached || (plan.due && cached.fetched < plan.due);
  if (!stale) return json({ ...cached, ...meta }, 200);
  let r;
  try {
    r = await fetch(`${ODDS_URL}?apiKey=${encodeURIComponent(env.ODDS_API_KEY)}&regions=uk&markets=h2h,totals&oddsFormat=decimal`);
  } catch (e) {
    return cached ? json({ ...cached, ...meta, stale: true }, 200) : json({ error: "odds_unreachable" }, 502);
  }
  if (!r.ok) {
    if (cached) return json({ ...cached, ...meta, stale: true }, 200);
    return json({ error: "odds_api", detail: r.status === 401 ? "the odds API key was rejected" : r.status === 429 ? "monthly odds quota used up" : "odds API returned " + r.status }, 502);
  }
  const events = await r.json();
  const out = { fetched: Date.now(), remaining: r.headers.get("x-requests-remaining"), events: events.map(summarise).filter(Boolean) };
  if (env.ODDS) await env.ODDS.put("epl", JSON.stringify(out));
  return json({ ...out, ...meta }, 200);
}

// Average the margin-free probabilities across bookmakers for one match.
function summarise(ev) {
  const h2h = [], over = [];
  for (const b of ev.bookmakers || []) {
    for (const m of b.markets || []) {
      if (m.key === "h2h") {
        const price = (name) => m.outcomes.find((o) => o.name === name)?.price;
        const ph = price(ev.home_team), pd = price("Draw"), pa = price(ev.away_team);
        if (ph && pd && pa) { const s = 1 / ph + 1 / pd + 1 / pa; h2h.push([1 / ph / s, 1 / pd / s, 1 / pa / s]); }
      } else if (m.key === "totals") {
        const o = m.outcomes.find((x) => x.name === "Over" && x.point === 2.5), u = m.outcomes.find((x) => x.name === "Under" && x.point === 2.5);
        if (o && u) over.push((1 / o.price) / (1 / o.price + 1 / u.price));
      }
    }
  }
  if (!h2h.length) return null;
  const avg = (i) => h2h.reduce((a, x) => a + x[i], 0) / h2h.length;
  return {
    home: ev.home_team, away: ev.away_team, commence: ev.commence_time, books: h2h.length,
    h2h: [avg(0), avg(1), avg(2)],
    over25: over.length ? over.reduce((a, b) => a + b, 0) / over.length : null,
  };
}

// ---------- every league member's squad for one gameweek ----------
// Squads for a finished gameweek never change, so they are stored in KV permanently after the first load.
// About 30 FPL requests on that first load (league table + one per manager), within the free-plan limit of 50.
const FPL_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; fc27-planner)", Accept: "application/json" };
async function fplJson(path) {
  const r = await fetch(FPL + path, { headers: FPL_HEADERS });
  if (!r.ok) throw new Error(path + " " + r.status);
  return r.json();
}
async function leaguePicks(env, league, gw) {
  if (gw < 1 || gw > 38) return json({ error: "bad gameweek" }, 400);
  const key = `lp:${league}:${gw}`;
  try {
    // The league table is always fetched live, so new members, leavers and renamed teams show straight away.
    const lg = await fplJson(`leagues-classic/${league}/standings/`);
    const members = lg.standings.results.slice(0, 45);
    // A finished gameweek's squads can't change, so stored ones are reused; anyone missing is fetched.
    const stored = env.ODDS ? await env.ODDS.get(key, "json") : null;
    const have = new Map(stored && stored.finished ? stored.managers.filter((m) => m.picks).map((m) => [m.entry, m]) : []);
    const finished = stored && stored.finished ? true : await fplJson(`fixtures/?event=${gw}`).then((fx) => fx.length > 0 && fx.every((f) => f.finished));
    const managers = await Promise.all(members.map(async (m) => {
      const base = { entry: m.entry, name: m.player_name, team: m.entry_name };
      if (finished && have.has(m.entry)) return { ...base, chip: have.get(m.entry).chip, picks: have.get(m.entry).picks };
      try {
        const p = await fplJson(`entry/${m.entry}/event/${gw}/picks/`);
        return { ...base, chip: p.active_chip, picks: p.picks.map((x) => [x.element, x.multiplier]) };
      } catch (e) {
        // 404 = the manager hadn't joined by then; anything else = try again next time.
        return { ...base, chip: null, picks: / 404$/.test(e.message) ? [] : null };
      }
    }));
    const out = { gw, finished, managers };
    if (finished && env.ODDS && managers.some((m) => !have.has(m.entry) && m.picks)) await env.ODDS.put(key, JSON.stringify(out));
    return json(out, 200);
  } catch (e) {
    return json({ error: "fpl_unreachable", detail: String(e.message || e) }, 502);
  }
}

// ---------- Premier League news (fetched fresh on every request) ----------
// Public RSS headline feeds; the page shows each headline with a link to the original story.
const NEWS_FEEDS = [
  ["BBC Sport", "https://feeds.bbci.co.uk/sport/football/premier-league/rss.xml"],
  ["The Guardian", "https://www.theguardian.com/football/premierleague/rss"],
];
const decode = (t) => t.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, " ").trim();
const tag = (item, name) => { const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(item); return m ? decode(m[1]) : ""; };
async function news() {
  const results = await Promise.all(NEWS_FEEDS.map(async ([source, url]) => {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; fc27-planner)", Accept: "application/rss+xml, application/xml" } });
      if (!r.ok) return { source, error: r.status, items: [] };
      const xml = await r.text();
      const items = (xml.match(/<item[\s>][\s\S]*?<\/item>/g) || []).slice(0, 60).map((it) => ({
        source, title: tag(it, "title"), link: tag(it, "link"), desc: tag(it, "description").slice(0, 400), date: Date.parse(tag(it, "pubDate")) || null,
      })).filter((x) => x.title && /^https:\/\//.test(x.link));
      return { source, items };
    } catch (e) { return { source, error: "unreachable", items: [] }; }
  }));
  const week = Date.now() - 8 * 864e5;
  const items = results.flatMap((r) => r.items).filter((x) => !x.date || x.date >= week).sort((a, b) => (b.date || 0) - (a.date || 0));
  return json({ fetched: Date.now(), sources: results.map((r) => ({ source: r.source, ok: !r.error, count: r.items.length })), items }, 200);
}

// ---------- club kit images (FPL's official shirt artwork) ----------
async function kitImage(code, gk) {
  try {
    const r = await fetch(`https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${code}${gk}-110.png`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; fc27-planner)" }, cf: { cacheTtl: 604800, cacheEverything: true },
    });
    if (!r.ok) return new Response("Not found", { status: 404 });
    return new Response(r.body, { headers: { "content-type": "image/png", "cache-control": "public, max-age=604800" } });
  } catch (e) { return new Response("Unavailable", { status: 502 }); }
}
