import { Hono } from 'hono'
import { verifySignature } from './appsignal'
import { authorizationUrl, createCard, exchangeCode } from './basecamp'
import { cardContent, cardTitle } from './format'
import type { AppSignalWebhookPayload, Bindings } from './types'

const DEDUPE_TTL_SECONDS = 7 * 24 * 60 * 60
const OAUTH_STATE_TTL_SECONDS = 10 * 60

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', (c) => c.text('appsignal-webhooks: ok'))

/**
 * AppSignal → Basecamp. Configured in each AppSignal app under
 * App Settings > Integrations > Webhooks.
 */
app.post('/webhooks/appsignal', async (c) => {
  const rawBody = await c.req.text()

  const valid = await verifySignature(
    rawBody,
    c.req.header('x-appsignal-signature'),
    c.env.APPSIGNAL_WEBHOOK_TOKENS
  )
  if (!valid) return c.text('Invalid signature', 401)

  let payload: AppSignalWebhookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return c.text('Invalid JSON', 400)
  }

  const ex = payload.exception
  if (!ex) return c.json({ ok: true, skipped: 'not an exception event' })

  const dedupeKey = `dedupe:${ex.site ?? 'unknown'}:${ex.environment ?? 'unknown'}:${ex.number ?? 'unknown'}`
  if (await c.env.KV.get(dedupeKey)) {
    return c.json({ ok: true, skipped: 'duplicate incident' })
  }

  const card = await createCard(c.env, { title: cardTitle(ex), content: cardContent(ex) })
  await c.env.KV.put(dedupeKey, String(card.id), { expirationTtl: DEDUPE_TTL_SECONDS })

  return c.json({ ok: true, card: card.app_url })
})

/**
 * One-time Basecamp OAuth setup. Visit /auth?key=<SETUP_KEY> in a browser,
 * approve access on launchpad.37signals.com, and tokens are stored in KV.
 */
app.get('/auth', async (c) => {
  if (c.req.query('key') !== c.env.SETUP_KEY) return c.notFound()

  const state = crypto.randomUUID()
  await c.env.KV.put(`oauth:state:${state}`, '1', { expirationTtl: OAUTH_STATE_TTL_SECONDS })

  const redirectUri = new URL('/auth/callback', c.req.url).toString()
  return c.redirect(authorizationUrl(c.env, redirectUri, state))
})

app.get('/auth/callback', async (c) => {
  const state = c.req.query('state')
  const code = c.req.query('code')
  if (!state || !code) return c.text('Missing code/state', 400)

  const stateKey = `oauth:state:${state}`
  if (!(await c.env.KV.get(stateKey))) return c.text('Invalid or expired state', 403)
  await c.env.KV.delete(stateKey)

  const redirectUri = new URL('/auth/callback', c.req.url).toString()
  await exchangeCode(c.env, code, redirectUri)

  return c.text('✅ Basecamp authorized. Cards can now be created automatically.')
})

app.onError((err, c) => {
  console.error('Unhandled error:', err.message)
  return c.text(`Error: ${err.message}`, 502)
})

export default app
