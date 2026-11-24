# How this site was set up (and how to set up a new one)

A step-by-step record of how the FC27 planner was built and hosted, to reuse for future sites.

## How the pieces fit

| Piece | What it does | Where it lives |
|---|---|---|
| GitHub repository | Stores the code and its history | `brijeshgor-cpu/FPL27_Planner` |
| Claude Code session | Writes, tests and deploys the code, and saves it to GitHub | claude.ai/code, linked to the repository |
| Cloudflare Worker | Hosts the live site, fetches FPL data on every reload, caches bookmaker odds, runs an hourly check | `https://fc27-planner.fc27-fpl.workers.dev` |
| claude.ai artifact (optional) | A private snapshot copy of the page | claude.ai/artifact/… |

FPL blocks web pages from reading its data directly. The Worker sits in the middle: the page asks the Worker, and the Worker asks FPL.

## Steps for a new site

### 1. GitHub (one-off, about 5 minutes)
1. Create a free account at github.com.
2. Click **New repository** and give it a name, e.g. `My_New_Site`.
3. Choose private or public. Private works fine with this setup.
4. Tick **Add a README** so the repository isn't empty.

### 2. Connect GitHub to Claude
1. In claude.ai/code, connect your GitHub account when prompted.
2. Install the **Claude GitHub App** on the new repository.
3. Start a new Claude Code session with that repository selected, then describe the site you want.

### 3. Cloudflare (one-off; already done for this account)

**Account**
- Create a free account at dash.cloudflare.com. One account can host every future site.

**API token** (lets Claude deploy for you)
1. Go to Profile → **API Tokens** → **Create Token**.
2. Use the **Edit Cloudflare Workers** template.
3. Choose your account and **All zones**, then click **Create Token**.

Paste the token only into the secure form Claude opens, never into the chat. It's stored on the Claude cloud environment and only sent to `api.cloudflare.com`.

**workers.dev name**
- This account's name is `fc27-fpl`, so every new site gets an address like `https://<site-name>.fc27-fpl.workers.dev`. You don't need a new name.

### 4. Network access in the Claude environment
- Claude asks to allow the hosts the site needs. For this site that was `fantasy.premierleague.com` and the workers.dev address.
- You approve this in a prompt.
- A site that uses other data sources needs its hosts approved the same way.

### 5. Extra API keys (only if needed)
This site uses a free key from the-odds-api.com, stored as a Cloudflare secret:
- **Where:** Worker → Settings → Variables and Secrets.
- **Name box:** type `ODDS_API_KEY`.
- **Value box:** paste the key itself.

Don't paste the key into the Name box.

### 6. Deploying and saving changes
- Claude builds the page with `python3 scripts/build_site.py`.
- It deploys with
  `CLOUDFLARE_API_TOKEN=proxy-injected CLOUDFLARE_ACCOUNT_ID=<account id> npx -y wrangler@4.20.0 deploy`.
- It checks the result in a browser on desktop, iPad and iPhone, then commits and pushes to GitHub.
- The page is bundled into the Worker script, because Cloudflare's separate file upload didn't work through the session's network proxy. So pushing to GitHub doesn't redeploy the site: changes need a Claude session, or a manual `wrangler deploy`, to go live.

## Project-specific settings (this site)
- **Cloudflare account ID:** `32d4d4bcdb3511c48210e711f67006e0`
- **Worker:** `fc27-planner`, configured in `wrangler.toml`
- **KV store:** `ODDS` (id `1612f48a342645ad8d40ddcb5b9303dc`). It caches odds, deadlines, league picks and gameweek stats.
- **Hourly cron** `7 * * * *`: refreshes the odds every day at about 11:07 UK time, and 3 days and 1 day before each deadline.
- **Secrets:** `ODDS_API_KEY`, and `FPL_LOGIN`. FPL_LOGIN is your FPL sign-in token, used to read Pick Team for the Current gameweek tab. To create it, follow the steps in that tab: copy a line from the browser console on fantasy.premierleague.com, then paste it into Cloudflare as the secret's value. No password is stored. The token renews itself hourly and is saved in KV as `fpl_auth`.
- **Development branch:** `claude/lucid-lamport-bu8fxu`

## Starting the next site
Start a new Claude Code session on the new repository and say something like:

> Build a site like my FC27 planner and host it on my Cloudflare account as a Worker called `<name>`.

If the Cloudflare token was saved on a different cloud environment, Claude will ask for it again through the secure form.

## Things to remember
- **The link is public.** Anyone with it can open the site. Cloudflare Access (free) can restrict it to chosen email addresses.
- **Free API plans have limits.** The odds plan allows 500 requests a month, Each refresh costs 2, so the daily refresh uses about 62 a month.
