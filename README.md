# FC27 Planner

A live FPL planner for **FC27** (entry 1965328) and the **Bring It On!** mini-league (111899).

- `scripts/fetch_data.py` pulls the official FPL API (`fantasy.premierleague.com/api/`) into `site/data.json`.
- `site/index.html` is the whole app: overview and league insights, standings with a season race chart, a rival squad comparison, a transfer planner, and a fixture difficulty grid.
- `.github/workflows/pages.yml` refreshes the data every 30 minutes and publishes the site to GitHub Pages.

The FPL API blocks direct browser requests (CORS), so the data is fetched server-side on a schedule rather than from the page.

## Run locally

```sh
python3 scripts/fetch_data.py && python3 scripts/build_site.py
cd dist && python3 -m http.server 8000   # open http://localhost:8000
```

To use it for another team or league, set `FPL_ENTRY_ID` / `FPL_LEAGUE_ID` env vars for the fetch script.
