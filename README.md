# appsignal-webhooks

Automates the on-call flow: receives AppSignal webhooks and creates a card in
the **Triage** column of the [On Call](https://app.basecamp.com/3081685/buckets/43085835/card_tables/8852717470)
card table in Basecamp for every *exception incident*. Runs on Cloudflare
Workers (Hono).

## How it works

- `POST /webhooks/appsignal` — endpoint configured in each AppSignal app
  (App Settings → Integrations → Webhooks). Verifies the
  `X-Appsignal-Signature` header (SHA256 of `token + body`), processes only
  `exception` events (deploys/performance/anomalies are ignored) and
  deduplicates per incident (`site + environment + number`) in Workers KV with
  a 7-day TTL.
- `GET /auth?key=<SETUP_KEY>` — one-time OAuth2 flow against
  launchpad.37signals.com. Stores the access/refresh tokens in KV; the Worker
  refreshes the access token automatically (2-week lifetime).

## Configuration

Vars (in `wrangler.jsonc`): `BASECAMP_ACCOUNT_ID`, `BASECAMP_BUCKET_ID`,
`BASECAMP_COLUMN_ID` (Triage column).

Secrets (`wrangler secret put <NAME>`):

| Secret | Description |
|---|---|
| `BASECAMP_CLIENT_ID` | Client ID of the integration in launchpad.37signals.com |
| `BASECAMP_CLIENT_SECRET` | Client secret of the integration |
| `APPSIGNAL_WEBHOOK_TOKENS` | Webhook verification tokens, comma-separated (one per AppSignal app) |
| `SETUP_KEY` | Key that protects `/auth` for the initial setup |

## Setup from scratch

```sh
pnpm install
wrangler kv namespace create KV     # then put the id in wrangler.jsonc
wrangler secret put BASECAMP_CLIENT_ID
wrangler secret put BASECAMP_CLIENT_SECRET
wrangler secret put APPSIGNAL_WEBHOOK_TOKENS
wrangler secret put SETUP_KEY
pnpm run deploy
```

Then:

1. In [launchpad.37signals.com/integrations](https://launchpad.37signals.com/integrations),
   add `https://<worker-url>/auth/callback` as a Redirect URI.
2. Open `https://<worker-url>/auth?key=<SETUP_KEY>` and authorize access to Basecamp.
3. In each AppSignal app: App Settings → Integrations → Webhooks, add
   `https://<worker-url>/webhooks/appsignal` checking only **Exception incidents**,
   and add that app's *Webhook verification token* to `APPSIGNAL_WEBHOOK_TOKENS`.

## Development

```sh
pnpm dev            # uses .dev.vars (see secrets above) — KV is local
pnpm exec tsc --noEmit
pnpm cf-typegen     # regenerate runtime types after changing wrangler.jsonc
```

To test the webhook locally:

```sh
BODY='{"exception":{"number":1,"site":"Test","environment":"dev","exception":"TestError","message":"hello"}}'
SIG=$(printf '%s' "dev-webhook-token${BODY}" | shasum -a 256 | cut -d' ' -f1)
curl -X POST http://localhost:8787/webhooks/appsignal \
  -H "X-Appsignal-Signature: $SIG" --data-binary "$BODY"
```
