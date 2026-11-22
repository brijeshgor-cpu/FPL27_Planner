// FC27 Planner on Cloudflare Workers.
// Serves the static page from ./worker/public and passes a fixed set of read-only
// FPL API requests through /api/*, so the page can load live data on every visit.
// (The FPL API does not allow browsers to call it directly.)

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
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });

    const path = url.pathname.slice("/api/".length);
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
