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

- **Captaincy: think beyond the top two.** When captain options are close (within about 0.6 xP), compare all
  of them, not just the top two. Weigh the route to a haul: chance to score, haul chance, penalties, and a
  home game against one of the weakest sides. A captain's points are doubled, so ceiling matters. When you're
  chasing, favour the option your rivals haven't captained. Be wary of an xP propped up by recent form when
  the underlying numbers (xG, xA, chance to score) are modest. Say what the choice costs in xP, and why the
  ceiling is worth it. (From GW12: Calvert-Lewin at home to Coventry, 53% to score and 19% haul chance, over
  Wirtz away at Everton, 18% and 7%, whose 7.7 xP leaned on recent form.)

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
- **Player predictions: Compare two players:** `drawPredCompare()`, state in `PCX`, toggled by
  "Compare two players". It has:
  - club-then-player pickers (default: the GW plan's first sell vs buy);
  - filters for Gametime (per start, per appearance, per 90), a Gameweeks slider, Venue (from each
    match's `was_home`) and Season. Earlier seasons are totals only, from `history_past`.
  - predicted points (`predPer`), 6 FDR-coloured fixture tiles, a profile radar against the
    position's 5th–95th percentiles, and head-to-head totals and per-gametime bars.

  Match data comes from `element-summary` (`pcHist`). xPts for a match is `deservedPts()` on its
  underlying numbers. A small-sample warning shows under 270 minutes.
- **Opta stats tab:** `renderOpta()` (`#opta`) and `drawOptaTable()`, state in `OS`. Data comes from the Worker's
  `/api/gwstats/{gw}`: every player's full live stats for a gameweek, with fixture ids, indexed by `OI`, and KV-cached
  once the gameweek is final. `optaRows()` sums the records over the Gameweeks, Venue and Fixture difficulty filters
  (venue and FDR come from each record's fixture). Teams sum their players, take goals conceded from the keepers and
  only count matches played for the current club.
  - Categories (`OCATS`, columns in `OCOLS`): Key stats, Goal threat, Creativity, Involvement (ICT), Set pieces
    (taker order), Defending (tackles, CBI, recoveries, DC, DC points), Goalkeeping, Discipline and FPL.
  - Players/Teams; Total / Per app / Per start / Per 90; search (with a Clear button, `#osClear`, also Esc); position (including Your squad); price slider;
    Hide low minutes (under 30% of possible minutes); Per £1m. Click a header to sort.
  - xPts is `deservedPts()` per match. `optaInsights()` shows "due a goal", the best value threat (passes
    `buySecure`), your player running hot, and your weakest underlying numbers.
  - Not in FPL's free data: shots, shots on target, shots in the box, big chances, key passes, big chances created
    and passing. Non-penalty xG needs penalty xG per match, which FPL doesn't publish.
- **Opta stats: player page:** click a player row (`[data-opid]`) to open `renderOptaPlayer(id)`, state in `OP`.
  - Header: photo (Worker `/photo/{code}.png`, falling back to the kit), tags, season points, points per game,
    ownership (overall and league) and minutes per start.
  - Filters: Season (2026/27, or last season's totals from `history_past`), Venue, Window (season, last 6, last 3)
    and Basis (per 90, per game, total). `opRecs()` and `opAgg()` build the records from `OS.gw`.
  - An analyst verdict (rank by 5-GW xP in his position, `buySecure`, momentum or sell case) and a running
    hot/due note.
  - Points vs xPts bars (last 5, last 10 or all), over/underperformance (points, goals, assists and goals
    conceded against expected), and Attacking and Defending percentile bars against the same position with
    enough minutes (`OP_METRICS`).
  - Defensive contribution: hit rate by starts or appearances, per 90, and per-gameweek bars against the
    threshold (10 for DEF, 12 for MID/FWD).
  - The next six gameweeks (`predPer`/`predMins`), a gameweek log, and Compare with… (opens Player predictions
    compare with the best buy-checked alternative).
- **Fixtures tab:** `renderFixtures()` and `drawFxTable()`. Sort by Overall (FPL FDR × 2, or team
  strength when the toggle is on), Attack, Defence, Goals or Clean sheets, with an Order, a Teams
  filter, a GW range slider with quick-set 3/5/8, and a Team strength toggle. FPL's own strength
  fields are zero this season, so `teamStrength()` builds attack from 60% team xG and 40% goals scored,
  and defence from 60% xG conceded and 40% goals conceded. `fixtureGoals()` uses the bookmaker odds
  for the next gameweek. Cells are always coloured by FPL's FDR. The Rotation section
  (`rotationHTML()`) is the owner's and stays as it is.
- **Fixtures: All teams / Compare two teams:** `FXS.mode` toggles a seg `[data-fxmode]`. "All teams" shows
  the filters and table (`#fxAll`); "Compare two teams" shows the Rotation section, which picks the pair
  (`rotPair`), and `drawTeamCompare()` / `teamCompareHTML(a, b)` below it. `teamProfile(t)` builds
  results, W-D-L, form, home and away, team xG and xA (player sums), xG conceded (keepers), clean sheets,
  defensive actions, key players, set-piece takers, the next GW's odds and the next-5 FDR. Insights
  include a Decision (which team to take attackers and defenders from), xG over- or underperformance,
  the easier run and the best asset that passes `buySecure`. `wireRotation()`'s redraw also redraws
  the comparison.
- **Odds tab: Who to target this gameweek:** `oddsInsightsHTML(rows, j)`, drawn into `#oddsIns` at the top of
  `drawOdds()` after `ensureFA` loads match histories. `oddsTargets()` gives each team's expected goals (λ from
  `fitGoals`), clean sheet and scoring chances (summed over a double gameweek). It shows:
  - insights: the top goal and clean-sheet targets; your players in the 4 worst fixtures (attackers by
    λ, defenders and keepers by clean sheet chance); the target slots you already cover; and the best-odds
    captain;
  - two cards with the top 4 teams for goals and for clean sheets, each with the model's best 2 players
    by 1-GW xP (`oddsPicks`: 60%+ start chance, and passing `buySecure` unless you own them);
  - the teams to avoid, and the main uncertainty (team news and how old the odds are).
- **Odds tab: Projected goals & clean sheets:** the main grid in `drawOdds()` (`.og-grid`), one card per
  fixture in kick-off order: kit, the team's expected goals (GLS, shaded blue) and clean sheet chance (CS%,
  shaded amber), its win chance and your-player badges. Two columns on desktop, one on phone. The full
  home/draw/away table sits under it in a collapsible `details.og-more`.
- **Matches tab:** `renderMatches()`. It shows every fixture of a gameweek from FPL's `fixtures/` data:
  the score, scorers, assists, own goals, penalties, red cards and bonus. A "Your players" panel per
  fixture gives that gameweek's squad, from `myPicksFor(gw)`, with minutes, points and Opta stats
  from `/api/gwplayers`. It shows the current gameweek until every match is played
  (`matchesDefaultGw()`), then the next one with kick-off times, win odds and your players' xP and
  start chance. Arrows browse other gameweeks.
- **Five-layer model and feedback loop (Train the model):**
  - **Layers:** `scoreCore()` is the projection; `expertScore()` caches it. `LAYER` switches let
    `layerBreakdown(e)` split a projection into Statistical (stats with FDR), Context (odds), Risk
    (minutes, availability, bans, news), Human (notes) and Feedback (recalibration). Why? shows it.
  - **Saving predictions:** `recordAdvice()` saves rich predictions (v2) before the deadline. Each
    holds xp, start chance, 70+ chance, expected minutes, goal and assist λ, clean sheet chance, team
    goal λ, note factor and note keys.
  - **Error classification:** `learnGw()` compares predictions with `/api/gw/{gw}` and the
    fixtures' events, and classifies each error into `ERR_CATS`: benching, early sub, suspected
    tactical change, attacking output, defensive underperformance, fixture assessment, unpredictable
    event, human observation error, plus "good pick, unlucky" and "lucky output". It judges against
    `deservedPts()` (what the match's underlying numbers were worth), not just points.
  - **Recalibration:** `calibrate()` needs 2+ finished gameweeks and produces per-position factors
    (vs deserved, ±15%), a starting-probability factor and note reliability (`noteRel`). These are
    saved to `/api/calib`. `noteWeight()` scales each kind of note's effect by its record
    (0.5 to 1.4).
- **Context learning (player predictions):** `recordAdvice()` also saves each prediction's context: FDR `fd`, home
  `h`, form `fo` and points per game `pp`, plus the team goal λ `tf` it already had. The pool is the top 90 plus the
  top 15 per position. `calibrate()` learns `CAL.ctx` from 2+ finished gameweeks: per bucket from `ctxKeys()` (fixture
  easy/mid/hard, home/away, team λ low/mid/high, form hot/normal/cold), the ratio of deserved points to the
  position-corrected projection. Each ratio is capped ±12%, shrunk by n/(n+50), and needs 25+ players.
  `ctxFactor(e, n, TO)` multiplies a player's buckets for his next fixture (capped ±15%, fading over longer horizons)
  and is applied with `calFactor` in `scoreCore`, so every tab's projections, buys and captain picks use it.
  `pickAccHTML()` (Train → Learning from results) shows, per position, the rank correlation of predicted xP with
  points and with deserved points, and how often the top 5 predicted finished in the top half; a table shows each
  context's predicted vs deserved and its correction.
- **Your strategy:** `STRAT_RULES`, saved to `/api/strategy` (owner only), with priority levels Off to
  Critical. They change decisions:
  - nailed: the buy start-rate floor;
  - mins70: a penalty for buys unlikely to play 70+;
  - flex: the value of rolling a transfer;
  - hits: the net gain a −4 needs;
  - squad14: the bonus for restoring cover;
  - diffs: the captain-differential threshold;
  - chips: off, normal or eager;
  - history: the form weight in `scoreCore` (Critical also turns off the momentum hold).

  The defaults reproduce the previous behaviour.
- **Train the model tab:** `renderTrain()` (`#train`). It holds Your notes and the advice scorecard
  ("How the advice did"). The note types are 15 `NOTE_CATS` in three groups:
  - Player: performance, tactical role, attacking threat, creativity, set-piece duties, defensive
    contributions, performance sustainability, emerging trend;
  - Selection & fitness: minutes security, rotation risk, injury and fitness, manager comments;
  - Team & match: opposition weakness, team performance, match context.

  The old names `attack` and `chances` map to tactical and threat through `CAT_ALIAS`. The overall
  calls are trust, captain, target, avoid and hold; rotation and injury are legacy tags that still
  work and become note types when a note is edited.
- **Notes, version 2:** a note holds any number of overall calls (`tags`: trust, captain, target,
  rotation, injury, avoid, hold) and "What you saw" categories (`cats`, each "+" or "-"). The
  categories are minutes & selection, attacking role, penalties & set pieces, chance involvement,
  fitness & availability, defensive role and match context; their effects are in `NOTE_CATS`, and some
  only apply to certain positions. It also holds text, which `noteSignals` reads. `noteEffect(e)`
  combines all three, capped at +20% and −55%, and also sets the start rate and the cap or floor on
  the chance of playing. Notes can be edited (`NOTE_EDIT`). Old single-`tag` notes still work, via
  `nTags`.
- **Your notes (human touch):** `NOTES`, loaded by `loadNotes()` from `/api/notes` (KV). Writes need
  the `OWNER_KEY` Worker secret, which a device stores after opening `?owner=KEY` once.
  The tags change the model everywhere:
  - trust: xP +10%;
  - rotation: start rate ×0.75 and xP ×0.8;
  - injury: chance of playing capped at 50% and xP ×0.5;
  - avoid: `buySecure` fails, so he's never suggested as a buy;
  - hold: `gwBuys` never sells him.

  - captain: favoured as captain when it's close (×1.15 in the captain ranking only);
  - target: considered for every transfer in his position, with a +1.5 nudge.

  The note's words count too. `noteSignals()` reads phrases from the text and applies small, visible
  multipliers through `NOTE_SIGNALS`:
  - "on pens" +5%, set pieces +3%, a more attacking role +6%, form or confidence +4%;
  - "knock" or "doubt": −15% and chance of playing capped at 75%;
  - "rested" or rotation: −10% and start rate ×0.85;
  - form or role worry −6%; new manager −5%.

  `noteFactor` and `calFactor` are applied in `expertScore`. The panel is in the Train the model tab.
  Show notes wherever they act: `noteLine()` adds "Your note applied" (with xP before and after) to
  every recommendation involving a noted player. The GW decision box, the Overview priorities and
  Key insights list the active notes.
- **Advice tracking:** `recordAdvice()` posts the GW plan before the deadline to `/api/rec/{gw}`. That
  covers captain, vice, best XI, transfers, holds and projections; the Worker refuses writes after the
  deadline. `renderAdviceScore()` (Insights) scores it afterwards. Once there are 2+ finished
  gameweeks and 30+ samples per position, it saves per-position calibration to `/api/calib`, which
  `calFactor` applies.
- **Transfers made analysis (Insights):** `renderTransfersMade()` (`#trMade`). Every transfer from `D.transfers`,
  plus pending ones for the next deadline from the Pick Team login (`latest`). Wildcard chains (A→B, B→C in one
  gameweek) are merged into A→C. Per transfer it shows sold vs bought points to date (from the transfer gameweek to
  now), "while owned" (until he was sold again; a Free Hit lasts one gameweek and is left out of the totals) and
  "points for you" from your picks (`myGwPicks`: multiplier and automatic subs). Points come from `/api/gwstats`
  (`OS.gw`). Insights: net gain after hits and the hit rate, the best and worst regular move, each wildcard judged as
  a whole (its one-for-one pairs are arbitrary), and a sold starter now outscoring his replacement over the last 3
  gameweeks.
- **Rival watch:** `renderRivalWatch()`, at the top of Mini League analysis. It shows the leader and
  the 2 managers above and below you: their likely captain, their threats, your edges and the
  projected swing.
- **3-gameweek plan:** `renderSeqPlan()` in the Transfer planner. Week 1 is the GW plan; weeks 2–3
  come from `weekMoves()`, using best-XI gain over the next 5 gameweeks with `windowXp`. Free
  transfers roll and the money freed is carried forward.
- **Captain choice (in `gwAdvice()`):** every captain option within max(`stratDiff()`, 0.6) xP of the best is compared,
  not just the top two, on `capScore` = xP (× captain note) + `capHaulW()` (default 3) × haul chance + the league factor (chasing:
  0.8 × (1 − league captaincy EO); protecting: 0.8 × EO; off when the diffs strategy is Off). Outside the band the
  best xP wins. Added after Calvert-Lewin (7.6 xP, 53% to score, 19% haul, 0% captained in the league) was left out
  of a Wirtz (7.7, 7% haul) vs Groß (8.1) comparison.
- **Captain learning:** the captain item keeps `capCands` (the close options with xP, haul chance, scoring chance,
  league EO and note boost) and `capStance`, which `recordAdvice()` saves with the GW plan (`capC`). After each
  final gameweek `capLearn()` (run with `loadNotes()`) replays the choice with haul weights 0–6 and keeps the
  weight whose picks scored most; `capHaulW()` uses it from 4 gameweeks, phased in fully by 8. `capLearnHTML()`
  shows it in "How the advice did".
- **Current gameweek tab:** `gwAdvice()` for the recommendations, `gwBuys()` for transfers,
  `gwChips()` for chips, `bestXI()`, `autoSub()` and `squadHealth()`.
- **News tab:** `renderNews()` / `drawNews()` (`#news`, after Current gameweek), state in `NW`. It fetches the Worker's
  `/api/teamnews` on every visit: each club's BBC Sport feed (`CLUB_FEEDS`), plus the BBC and Guardian Premier League
  feeds, with a 2-minute edge cache. Articles from before the last deadline that has passed (the start of the
  current gameweek) are dropped.
  - Articles are matched to clubs by feed, club name or player name, and to players by FPL name. Players who share
    a name are only matched to the article's club. "Team news" (`PRESS_RE`, excluding match reports via
    `REPORT_RE`) covers injuries, fitness, availability and manager comments.
  - Sections: Your players' availability (FPL flags, with bench cover from `autoSub`), then a card per club in
    alphabetical order (all teams by default, or just yours). The owner removed the press-conference and possibly-dropped lists. Each card has the next fixture, the expected press
    conference day (kick-off minus 2 days, an Assumption) and, with no article lists (the owner's preference), a
    one-line outlook for each injured, suspended or possibly dropped key player: `outlook()` gives Likely to start,
    Doubt leaning yes, Doubt, Unlikely or Out. It uses the strongest source available: news since the flag
    (`POS_RE`/`NEG_RE` on articles naming him, quoted, labelled Assumption), then FPL's flag (Fact), then
    `minutesProfile().pStart` (Projection).
  - Key players: your squad, 10%+ owned overall or 20%+ in the league, and each club's top 3 scorers.
  - Possibly dropped or rotated (`newsDropped()`, now shown only inside the club cards): players you own, 3%+ owned overall or 10%+ in the league, who had
    3+ starts in their club's previous 5 games but in the club's latest finished match didn't play, came off the
    bench, were sent off or were taken off before 45'. Data comes from `OS.gw`. Each shows the FPL flag (or "no flag:
    a selection call"), recent minutes, the GW start chance (`minutesProfile().pStart`, as likely, in doubt or
    unlikely), matching articles and, for your players, a decision with bench cover. Each club card lists its
    players too.
- **News start calls: learning loop.**
  - **Saving:** `recordNewsCalls()` saves every outlook (id, shown p, raw p `pr`, source news/flag/model, FPL chance
    `c`, status, drop kind, verdict) to the Worker's `/api/newsrec/{gw}` (owner key; refused after the deadline; index
    `newsrecs`). It runs from the News tab, and in the background from the Current gameweek and Train tabs
    (`newsCallsInBackground()`, which uses `drawNews(true)` in compute-only mode). The last save before the deadline
    counts.
  - **Learning:** `loadNewsCal()` runs with `loadNotes()`. For each saved gameweek whose `/api/gwstats` is final, it
    checks the calls against starts (ST) and appearances (minutes) and builds `NCAL`:
    - per source × band (0–25/25–50/50–75/75–100%) of raw p: calls, mean prediction and start rate;
    - FPL flag levels: played and started rates;
    - overall right-call rate and Brier score.
  - **Using it:** `newsCalibrate()` shifts new raw calls by the band's error (8+ calls, shrink n/(n+15), capped
    ±0.2) and notes "Adjusted from X%". `availability()` uses the learned play rate for 25/50/75% flags (8+ calls,
    blended with FPL's %), so the xP model learns too.
  - **Scorecard:** `newsLearnHTML()` (`#nwLearn`) shows calls checked, right-call rate, Brier score, the calibration
    table, the flag rates, the biggest misses and the save status.
- **Transfers to make (Current gameweek, bottom):** `gwXfersHTML(st)` (`#gwXfers`), cached in `GWE.xs`. Four plans for
  the team as edited:
  - **Model's pick:** `gwBuys()` unchanged.
  - **Low risk (`SCEN`):** xP × 70+-minute security plus 6 × league ownership, so it avoids selling template players.
    Buys must be 85%+ to start and 60%+ to play 70+. No hits.
  - **High risk:** (gp5 + 1.5 × gp1) × (1 − 0.55 × league ownership). Buys are owned by 20% or less of the league.
    One −4 is allowed.
  - **Optimistic:** xP if he starts, blended with form × fixtures. One −4 is allowed.

  `scenPlan()` runs the greedy best-XI search (like `gwBuys`) with each strategy's value function. All buys pass
  `buySecure`; momentum holds and hold notes are respected. Guard rails: a free move may cost at most 1.5 model xP
  (gp5), and a −4 must gain 4+ on the model. Each card shows the decision, the moves with `sellCase` and the
  template-sale risk, the model's xP, GW gain, hits, the league ownership of buys, the bank, and the cost against the
  Model's pick. It also gives the main uncertainty, the Money freed next step (`scenNext`, excluding players just
  sold) and Apply (`gwTransfer` for each move). `leagueCtx()` says which strategy to lean to.
- **Data you can't get for free:** penalty-box touches, shots, chances created, duels and manager
  comments aren't in FPL's free data, so say so instead of guessing. FPL's xG includes penalties;
  non-penalty xG is estimated by taking about 0.76 xG off per penalty for the first-choice taker.

## Working rules
- Build with `python3 scripts/build_site.py`, deploy with wrangler (see `SETUP.md`), then check
  desktop, iPad and iPhone in light and dark mode.
- Commit and push to the development branch, then republish the claude.ai snapshot artifact
  (https://claude.ai/artifact/VtRnD4EKUNtXr9d6Xc35si) with `files: {"data.json": "site/data.json"}`.
- Everything refreshes on every reload except the bookmaker odds, which refresh daily at about 11am UK time and 3 days and 1 day
  before each deadline.
