#!/usr/bin/env bash
# Deploy BG27 WordRush.
#   1. Build the page and bundle the Worker.
#   2. Upload the bundle to Cloudflare Pages (https://bg27-wordrush.pages.dev) through the API.
#      `wrangler pages deploy` fails through the Claude session proxy, so the upload uses curl.
#   3. Redeploy the two old workers.dev Workers, which only redirect to the Pages address.
# Needs CLOUDFLARE_API_TOKEN (the session proxy injects it) and the account id below.
set -euo pipefail
cd "$(dirname "$0")"
export CLOUDFLARE_ACCOUNT_ID=32d4d4bcdb3511c48210e711f67006e0
export CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN:-proxy-injected}
python3 build.py
rm -rf .bundle && npx -y wrangler@4.20.0 deploy --dry-run --outdir .bundle > /dev/null
cp .bundle/worker.js pages/public/_worker.js
curl -sf -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/bg27-wordrush/deployments" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" --form-string 'manifest={}' --form-string 'branch=main' \
  -F "_worker.js=@pages/public/_worker.js;filename=_worker.js;type=application/javascript+module" > /dev/null
echo "Pages deployed: https://bg27-wordrush.pages.dev"
npx -y wrangler@4.20.0 deploy > /dev/null && npx -y wrangler@4.20.0 deploy --name bg27-words > /dev/null
echo "Old workers.dev addresses redirect to Pages"
