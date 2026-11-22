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
    if (!url.pathname.startsWith("/api/")) return serveStatic(url.pathname);
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });

    const path = url.pathname.slice("/api/".length);
    if (path === "odds" || path === "odds/") return odds(env);
    if (!ALLOWED.some((re) => re.test(path))) return json({ error: "not allowed" }, 404);

    const page = url.searchParams.get("page_standings");
    const target = FPL + path + (page && /^\d+$/.test(page) ? `?page_standings=${page}` : "");
    // Short edge cache: big static-ish files for 5 min, everything else for 1 min.
    const ttl = /^(bootstrap-static|fixtures)\//.test(path) ? 300 : 60;

    let upstream;
    try {
      upstream = await fetch(target, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; fc27-planner)", Accept: "application/json" },
        cf: { cacheTtl: ttl, cacheEverything: true },
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
