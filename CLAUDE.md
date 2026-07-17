# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Cloudflare Worker (Hono) that turns AppSignal exception webhooks into cards in the
**Triage** column of the Basecamp "On Call" card table (project "Devs: On-Call").
Production: `https://appsignal-webhooks.iqthink.workers.dev`.

## Commands

```sh
pnpm dev                 # local server on :8787, reads secrets from .dev.vars
pnpm exec tsc --noEmit   # typecheck (no test suite)
pnpm cf-typegen          # regenerate worker-configuration.d.ts after changing wrangler.jsonc
```

There is no manual deploy step in the normal flow: **pushing to `main` deploys via
Cloudflare Workers Builds** (runs `pnpm run deploy`). Only use `pnpm run deploy`
directly for emergency out-of-band deploys.

To exercise the webhook locally, sign the exact bytes sent (a trailing newline
changes the signature):

```sh
SIG=$({ printf '%s' "dev-webhook-token"; cat payload.json; } | shasum -a 256 | cut -d' ' -f1)
curl -X POST http://localhost:8787/webhooks/appsignal \
  -H "X-Appsignal-Signature: $SIG" --data-binary @payload.json
```

## Architecture

Request flow for `POST /webhooks/appsignal` (src/index.ts): verify
`X-Appsignal-Signature` = SHA256(token + raw body) against any token in
`APPSIGNAL_WEBHOOK_TOKENS` (src/appsignal.ts) → only payloads with a top-level
`exception` key proceed (deploy `marker`, `performance`, `alert_id` events are
acked with 200 and ignored) → dedupe lookup in KV → build card title/HTML
(src/format.ts) → create card via Basecamp API (src/basecamp.ts) → write dedupe
key. Ordering matters: the dedupe key (`dedupe:{site}:{env}:{number}`, 7-day TTL)
is written only after the card is created, so a failed Basecamp call stays
retryable.

Basecamp auth (src/basecamp.ts): OAuth2 against launchpad.37signals.com, tokens
stored in KV under `basecamp:tokens`. Access tokens live 2 weeks; refreshed
lazily when <24h remain, plus one forced refresh + retry on a 401. The one-time
bootstrap is `GET /auth?key=<SETUP_KEY>` → `/auth/callback` (CSRF state kept in
KV). If KV ever loses the tokens, re-run that flow; the SETUP_KEY secret guards it.

Configuration split: Basecamp account/bucket/column IDs are plain vars in
`wrangler.jsonc`; credentials (`BASECAMP_CLIENT_ID`, `BASECAMP_CLIENT_SECRET`,
`APPSIGNAL_WEBHOOK_TOKENS`, `SETUP_KEY`) are Worker secrets. `Bindings` in
src/types.ts is the single manual source of truth for both — update it when
adding either kind.

Onboarding another AppSignal app: append its webhook verification token
(comma-separated) via `wrangler secret put APPSIGNAL_WEBHOOK_TOKENS` and point
that app's webhook at `/webhooks/appsignal` with only "Exception incidents"
checked. No code change needed.

## Conventions

- Conventional Commits in English (`feat:`, `fix:`, `refactor:`, `chore:`).
- Everything in the repo is English: code, comments, strings, docs.
- No `//` line comments; only `/** */` blocks for non-obvious constraints.
- Card `content` is Basecamp rich text — limited HTML subset; always escape
  interpolated values (see `escapeHtml` in src/format.ts).
