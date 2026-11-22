#!/usr/bin/env python3
"""Fetch FPL data for FC27 and the "Bring It On" mini-league into site/data.json.

Standard library only, so it runs anywhere (GitHub Actions included).
Usage: python3 scripts/fetch_data.py [--out site/data.json]
"""
import argparse
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone

BASE = "https://fantasy.premierleague.com/api/"
ENTRY_ID = int(os.environ.get("FPL_ENTRY_ID", "1965328"))
LEAGUE_ID = int(os.environ.get("FPL_LEAGUE_ID", "111899"))
UA = "Mozilla/5.0 (X11; Linux x86_64) fpl-planner/1.0"

ELEMENT_FIELDS = [
    "id", "web_name", "first_name", "second_name", "team", "element_type", "now_cost",
    "total_points", "event_points", "form", "points_per_game", "ep_next", "ep_this",
    "selected_by_percent", "minutes", "starts", "goals_scored", "assists", "clean_sheets",
    "expected_goals", "expected_assists", "expected_goal_involvements",
    "expected_goal_involvements_per_90", "expected_goals_conceded_per_90",
    "defensive_contribution_per_90", "bonus", "status", "news", "chance_of_playing_next_round",
    "cost_change_event", "cost_change_start", "transfers_in_event", "transfers_out_event",
    "penalties_order", "yellow_cards", "red_cards", "news_added", "chance_of_playing_this_round",
    "expected_goals_per_90", "expected_assists_per_90", "saves_per_90", "defensive_contribution",
    "price_change_percent", "price_change_projections", "price_change_locked_until", "price_change_calibrating",
]


def get(path, retries=4):
    url = BASE + path
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception as exc:  # noqa: BLE001
            if attempt == retries - 1:
                raise RuntimeError(f"GET {url} failed: {exc}") from exc
            time.sleep(2 ** attempt)


def picks_for(entry_id, gw):
    try:
        p = get(f"entry/{entry_id}/event/{gw}/picks/")
    except RuntimeError:
        return None
    return {
        "chip": p.get("active_chip"),
        "picks": [[x["element"], x["position"], x["multiplier"], int(x["is_captain"]), int(x["is_vice_captain"])]
                  for x in p["picks"]],
        "bank": p["entry_history"].get("bank"),
        "value": p["entry_history"].get("value"),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "site", "data.json"))
    args = ap.parse_args()

    boot = get("bootstrap-static/")
    fixtures = get("fixtures/")
    events = boot["events"]
    current = next((e for e in events if e["is_current"]), None)
    nxt = next((e for e in events if e["is_next"]), None)
    cur_gw = current["id"] if current else 0

    entry = get(f"entry/{ENTRY_ID}/")

    # League standings (paginated)
    standings, page, league_meta = [], 1, None
    while True:
        lg = get(f"leagues-classic/{LEAGUE_ID}/standings/?page_standings={page}")
        league_meta = lg["league"]
        standings += lg["standings"]["results"]
        if not lg["standings"]["has_next"] or page >= 5:
            break
        page += 1

    ids = [r["entry"] for r in standings]
    if ENTRY_ID not in ids:
        ids.append(ENTRY_ID)

    managers = {}
    for eid in ids:
        h = get(f"entry/{eid}/history/")
        managers[eid] = {
            "history": [[c["event"], c["points"], c["total_points"], c["event_transfers"],
                         c["event_transfers_cost"], c["points_on_bench"], c["overall_rank"], c["value"], c["bank"]]
                        for c in h["current"]],
            "chips": [[c["name"], c["event"]] for c in h["chips"]],
            "past": [[p["season_name"], p["total_points"], p["rank"]] for p in h.get("past", [])][-5:],
            "picks": picks_for(eid, cur_gw) if cur_gw else None,
            "orank": get(f"entry/{eid}/").get("summary_overall_rank"),
        }
        time.sleep(0.15)

    transfers = get(f"entry/{ENTRY_ID}/transfers/")

    data = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "me": ENTRY_ID,
        "entry": {k: entry.get(k) for k in [
            "id", "name", "player_first_name", "player_last_name", "summary_overall_points",
            "summary_overall_rank", "summary_event_points", "summary_event_rank", "current_event",
            "last_deadline_bank", "last_deadline_value", "last_deadline_total_transfers", "started_event",
        ]},
        "league": {"id": league_meta["id"], "name": league_meta["name"]},
        "standings": [{k: r[k] for k in ["entry", "entry_name", "player_name", "rank", "last_rank", "total", "event_total"]}
                      for r in standings],
        "managers": managers,
        "transfers": [[t["event"], t["element_in"], t["element_in_cost"], t["element_out"], t["element_out_cost"]]
                      for t in transfers],
        "events": [{
            "id": e["id"], "deadline": e["deadline_time"], "finished": e["finished"],
            "is_current": e["is_current"], "is_next": e["is_next"], "avg": e["average_entry_score"],
            "high": e["highest_score"], "data_checked": e["data_checked"],
        } for e in events],
        "current_gw": cur_gw,
        "next_gw": nxt["id"] if nxt else None,
        "price_deadlines": (boot.get("game_config") or {}).get("settings", {}).get("price_change_deadlines", []),
        "chips_def": [[c["name"], c["start_event"], c["stop_event"]] for c in boot["chips"]],
        "teams": [{"id": t["id"], "name": t["name"], "short": t["short_name"], "strength": t["strength"]}
                  for t in boot["teams"]],
        "positions": {str(t["id"]): t["singular_name_short"] for t in boot["element_types"]},
        "squad_rules": {str(t["id"]): [t["squad_select"], t["squad_min_play"], t["squad_max_play"]]
                        for t in boot["element_types"]},
        "elements": [[e.get(f) for f in ELEMENT_FIELDS] for e in boot["elements"] if not e.get("removed")],
        "element_fields": ELEMENT_FIELDS,
        "fixtures": [[f["id"], f["event"], f["team_h"], f["team_a"], f["team_h_difficulty"], f["team_a_difficulty"],
                      f["kickoff_time"], int(bool(f["finished"])), int(bool(f["started"])),
                      f["team_h_score"], f["team_a_score"]]
                     for f in fixtures],
    }

    out = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as fh:
        json.dump(data, fh, separators=(",", ":"))
    print(f"wrote {out} ({os.path.getsize(out)//1024} KB), GW{cur_gw}, {len(standings)} managers")


if __name__ == "__main__":
    sys.exit(main())
