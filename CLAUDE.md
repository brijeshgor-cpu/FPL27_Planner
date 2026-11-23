# FC27 FPL Planner: working notes for Claude

The site is a single page (`site/index.html`) served by a Cloudflare Worker (`worker/src/index.js`).
`SETUP.md` covers hosting, secrets and deploys. Team FC27 (entry 1965328) is in mini-league "Bring It On!" (111899).

## The mission
The site exists to help FC27 **win the "Bring It On!" mini-league and climb the overall rankings**. The
owner's standing request:
- **Keep improving.** Look for better metrics, a stronger model and better decisions, and suggest
  them proactively.
- **Fix what's wrong.** If any data or insight on the site is incorrect or inconsistent, correct it
  without waiting to be asked, and say what was wrong.
- **Add a human touch.** Stats don't capture everything: form and confidence, a fixture the numbers
  undervalue, manager behaviour, the mini-league situation. When judgement overrides the numbers,
  say so, label it an Assumption, and give the reasoning. The owner's feedback rules below are
  examples of this; add new ones as they come up.

## The analyst model: apply this to every insight and recommendation

The owner's standing brief. Every new feature, insight or recommendation must follow it.

> Act as my Fantasy Premier League analyst. Help me maximise expected points in the current Gameweek
> and across my planning horizon. Give me a clear decision, the evidence behind it, and the main
> uncertainty that could change it.

### Defaults
- Prioritise cumulative expected points. Use mini-league position, ownership and effective ownership
  to judge how much risk to take when the expected-points trade-off is small.
- Build towards at least 14 genuinely playable players out of 15. A flagged player with uncertain
  availability, or a player whose usual role is a late cameo, doesn't count as reliable cover. During
  congested periods, favour established starters likely to play 70+ minutes.
- Assess the current gameweek first, then compare moves over the next 3–5 gameweeks. Extend the
  horizon if a planned chip, fixture swing or longer-term transfer materially changes the decision.
- Check the current season's rules and the latest squad, bank, free transfers and remaining chips
  before relying on them. Treat uncertain future fixtures as scenarios.

### Core analytics
1. **Expected points (xP).** Minutes-adjusted xP is the main ranking metric. It covers appearance
   points, goals, assists, clean sheets, penalties, bonus and defensive contributions under the
   season's rules. Check what a projection already includes before adjusting it for odds, minutes or
   form. Treat small differences as close calls.
2. **Expected minutes and lineup security.**
   - Measure: chance of starting, expected minutes if starting, chances of 60+ and 70+ minutes, and
     cameo risk.
   - Inputs: recent starts, substitutions, injuries, suspensions, competition for places and
     fixture congestion.
   - Distinguish a likely absence (a legal auto-sub can help) from a likely short cameo (that cover
     can be lost).
3. **Attacking threat and role.**
   - Use non-penalty xG and xA per 90 with total minutes and recent role.
   - Assess penalties and set pieces separately.
   - Give a confirmed role change more weight than one haul or blank.
4. **Team strength and match odds.**
   - Use team scoring and clean sheet probabilities, anytime goalscorer odds, team xG/xGA, and home
     or away context.
   - Remove the bookmaker margin.
   - Check whether player odds assume he starts before combining them with minutes.
   - Keep team strength separate from a player's xP.
5. **Form and data quality.**
   - Use the last match to spot role, minutes or availability changes, and judge performance over a
     larger sample.
   - Label confirmed facts, projections and assumptions.
   - Show the source and freshness of key inputs.
   - If a key input is missing, give a conditional recommendation and say what to check.

### Decision rules
- **Starting XI and bench.**
  - Find the strongest legal XI.
  - Settle close calls on xP, lineup security and routes to points.
  - Order the bench with legal auto-subs in mind.
  - Flag positions where one absence leaves weak cover.
- **Captain and vice-captain.**
  - Compare the top two on xP, minutes security and haul potential.
  - Quantify the expected cost of a higher-upside alternative.
  - Choose a dependable vice-captain, and flag shared postponement risk.
- **Transfers.**
  - Compare rolling against the strongest transfer or sequence over the same horizon.
  - Measure the improvement to the actual starting XI and explain any change in bench cover.
  - Subtract hits.
  - Explain what spending now costs in flexibility, budget or future moves.
  - Compare sale and purchase prices.
  - Prefer waiting for team news when that information is worth more than the risk of a price rise.
- **Chips.**
  - Compare using an available chip now with saving it for the best plausible later window.
  - For a Free Hit, compare the temporary XI with the best realistic XI without the chip, and check
    the squad you return to.
- **Risk.**
  - Take calculated risks when chasing rank or a mini-league lead.
  - Look for a genuine route to a haul.
  - Say how much expected value the risk gives up and what outcome makes it worthwhile.

### Owner's rules (added from feedback; apply them everywhere)
- **Momentum and fixture hold.** Don't sell a player this gameweek if he returned in his last match
  (a goal, an assist, 8+ pts, or a clean sheet with 6+ pts for a defender or keeper, in 45+ minutes)
  *and* his next fixture is easy (FDR 2 or lower, or his team is 75%+ to score, or 35%+ to keep a clean
  sheet for defenders and keepers). Show it as "Keep X this week". Give his return, the fixture, the
  5-gameweek gain you're passing up and the cost of waiting (e.g. a price rise), and revisit next week.
  In the code this is `momentum(e)`, used in `gwBuys()`.
- **Last-match check for buys.** Never suggest buying a player who played under 45 minutes in his
  last match (`buySecure`). Name anyone skipped and say why.
- **Sell case.** Every sell suggestion shows `sellCase(e)`: recent blanks, the next 3 fixtures with FDR,
  and the gameweek's odds. For attackers that's team win and scoring chances against the opponent's
  clean sheet chance; for defenders and keepers, team win and clean sheet chances against the
  opponent's scoring chance. Cold form plus a tough run plus poor odds justifies selling even a
  template player.
- **Template sales.** When suggesting selling a player most of the league owns, say what it risks
  for the mini-league. When a downgrade frees money, say where it should go next.

### Output format for recommendations
Every recommendation item should carry:
- **a decision:** the headline action, such as "Start X over Y" or "Captain X, vice Y";
- **evidence:** the numbers behind it;
- **main uncertainty:** what could change it, and what to check;
- **a label:** Fact, Projection or Assumption, for anything that drives the call;
- optionally a **Why?** tap holding the Opta stats and odds, and an **Apply** button.

Every alert must pass one test: *would this make me change my starting XI, captain, vice-captain,
bench order, transfers or chip before the deadline?*

## Where the model lives in the code (`site/index.html`)
- **xP:** `expertScore(e, n, TO)`, which blends:
  - `modelPts`: FPL scoring rules applied to xG/xA per 90, clean sheets from xGA, defensive
    contributions, saves and bonus, with odds for the next gameweek and FDR after that;
  - `proj`: form and points per game.

  It then adjusts for minutes, availability, bans, returning rivals and news. `gp1` and `gp5` are
  the 1- and 5-gameweek versions used in the Current gameweek tab.
- **Minutes:** `minutesProfile(e)`. It returns the chance of starting, of 60+ and of 70+ minutes,
  expected minutes if he starts, the chance of a cameo and of not playing, and a reliability flag,
  all for the next gameweek's match.
- **Buy safety:** `buySecure(e)` checks that a player is fit, starts at least 70% of matches and played 45+
  minutes in his last match (`lastMatch`). Every buy suggestion must pass it: `candidates()` (GW plan,
  Overview, planner) and the Insights cards. Name anyone skipped and say why. `prefetchBuyPool()`
  loads match histories for the strongest options so the last-match check has data.
- **Odds:** `teamOdds()`, which removes the margin from the 1X2 and over/under 2.5 prices (a Poisson
  fit), and `scoreChance()` for anytime-scorer chances.
- **Mini-league context:** `leagueCtx()` gives your position, the gaps and a risk stance; `own` and
  `eo` hold league ownership and effective ownership; `capCount` holds captain counts.
- **Your official team:** `loadOfficial()` sets `OFF` from FPL's Pick Team (`/api/my-team`, which needs
  the FPL_LOGIN secret). `OFF` holds the GW squad, bank, free transfers left and FPL's own sale and
  purchase prices. The Transfer planner (`baseSquad()`, `sellPrice()`, `boughtPrice()`), the
  Overview's free-transfers box, Insights, Fixtures and the GW12 engine all read it, so every tab starts from the real
  team. `squadOf(myM)` is last gameweek's team: use it only for last gameweek's results.
- **Player predictions tab:** `renderPredict()` and `drawPredList()`. Per-gameweek xP is
  `predPer(e, k)`, the difference between `expertScore` horizons, and expected minutes are
  `predMins(e, k)`. `teamOdds()` is cached per odds download, because the Poisson fit is expensive.
- **Fixtures tab:** `renderFixtures()` and `drawFxTable()`. Sort by Overall (FPL FDR × 2, or team
  strength when the toggle is on), Attack, Defence, Goals or Clean sheets, with an Order, a Teams
  filter, a GW range slider with quick-set 3/5/8, and a Team strength toggle. FPL's own strength
  fields are zero this season, so `teamStrength()` builds attack from 60% team xG and 40% goals scored,
  and defence from 60% xG conceded and 40% goals conceded. `fixtureGoals()` uses the bookmaker odds
  for the next gameweek. Cells are always coloured by FPL's FDR. The Rotation section
  (`rotationHTML()`) is the owner's and stays as it is.
- **Matches tab:** `renderMatches()`. It shows every fixture of a gameweek from FPL's `fixtures/` data:
  the score, scorers, assists, own goals, penalties, red cards and bonus. A "Your players" panel per
  fixture gives that gameweek's squad, from `myPicksFor(gw)`, with minutes, points and Opta stats
  from `/api/gwplayers`. It shows the current gameweek until every match is played
  (`matchesDefaultGw()`), then the next one with kick-off times, win odds and your players' xP and
  start chance. Arrows browse other gameweeks.
- **Your notes (human touch):** `NOTES`, loaded by `loadNotes()` from `/api/notes` (KV). Writes need
  the `OWNER_KEY` Worker secret, which a device stores after opening `?owner=KEY` once.
  The tags change the model everywhere:
  - trust: xP +10%;
  - rotation: start rate ×0.75 and xP ×0.8;
  - injury: chance of playing capped at 50% and xP ×0.5;
  - avoid: `buySecure` fails, so he's never suggested as a buy;
  - hold: `gwBuys` never sells him.

  `noteFactor` and `calFactor` are applied in `expertScore`. The panel is on the Current gameweek tab.
- **Advice tracking:** `recordAdvice()` posts the GW plan before the deadline to `/api/rec/{gw}`. That
  covers captain, vice, best XI, transfers, holds and projections; the Worker refuses writes after the
  deadline. `renderAdviceScore()` (Insights) scores it afterwards. Once there are 2+ finished
  gameweeks and 30+ samples per position, it saves per-position calibration to `/api/calib`, which
  `calFactor` applies.
- **Rival watch:** `renderRivalWatch()`, at the top of Mini League analysis. It shows the leader and
  the 2 managers above and below you: their likely captain, their threats, your edges and the
  projected swing.
- **3-gameweek plan:** `renderSeqPlan()` in the Transfer planner. Week 1 is the GW plan; weeks 2–3
  come from `weekMoves()`, using best-XI gain over the next 5 gameweeks with `windowXp`. Free
  transfers roll and the money freed is carried forward.
- **Current gameweek tab:** `gwAdvice()` for the recommendations, `gwBuys()` for transfers,
  `gwChips()` for chips, `bestXI()`, `autoSub()` and `squadHealth()`.
- **Data you can't get for free:** penalty-box touches, shots, chances created, duels and manager
  comments aren't in FPL's free data, so say so instead of guessing. FPL's xG includes penalties;
  non-penalty xG is estimated by taking about 0.76 xG off per penalty for the first-choice taker.

## Working rules
- Build with `python3 scripts/build_site.py`, deploy with wrangler (see `SETUP.md`), then check
  desktop, iPad and iPhone in light and dark mode.
- Commit and push to the development branch, then republish the claude.ai snapshot artifact
  (https://claude.ai/artifact/VtRnD4EKUNtXr9d6Xc35si) with `files: {"data.json": "site/data.json"}`.
- Everything refreshes on every reload except the bookmaker odds, which refresh 3 days and 1 day
  before each deadline.
