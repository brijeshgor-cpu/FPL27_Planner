# FC27 Planner

A live FPL planner for **FC27** (entry 1965328) and the **Bring It On!** mini-league (111899).

- `scripts/fetch_data.py` pulls the official FPL API (`fantasy.premierleague.com/api/`) into `site/data.json`.
- `site/index.html` is the whole app: overview and league insights, standings with a season race chart, a rival squad comparison, a transfer planner, and a fixture difficulty grid.
- `worker/src/index.js` is a Cloudflare Worker that serves the page and passes a fixed list of read-only FPL API calls through `/api/`, so **the page loads live data every time it is opened or reloaded**. (The FPL API blocks direct browser requests.)
- If live data can't be reached, the page falls back to the saved snapshot in `data.json` and says so.

## Deploy on Cloudflare (free)

1. Create a free account at dash.cloudflare.com.
2. Workers & Pages → Create → Import a repository → connect GitHub and pick this repo and branch.
3. Keep the defaults (deploy command `npx wrangler deploy`) and deploy. The site is at `https://fc27-planner.<your-subdomain>.workers.dev`.

Every push to the branch redeploys. After editing `site/index.html`, run `python3 scripts/build_site.py` and commit `worker/public/`.
To limit who can open it, add Cloudflare Access (Zero Trust → Access → Applications) with the emails you want to allow.

## Run locally

```sh
python3 scripts/fetch_data.py && python3 scripts/build_site.py
npx wrangler dev   # live mode at http://localhost:8787
# or snapshot only: cd dist && python3 -m http.server 8000
```

To use it for another team or league, set `FPL_ENTRY_ID` / `FPL_LEAGUE_ID` env vars for the fetch script.
