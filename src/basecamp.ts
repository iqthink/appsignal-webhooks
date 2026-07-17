import { createBasecampClient, isErrorCode } from '@37signals/basecamp'
import type { Card } from '@37signals/basecamp'
import type { Bindings } from './types'

/**
 * Basecamp OAuth2 token lifecycle + API access.
 *
 * API calls go through the official SDK (@37signals/basecamp). The OAuth web
 * flow stays hand-rolled: the SDK's interactive login targets CLIs (local
 * callback server), while this Worker authorizes once via /auth and keeps
 * tokens in KV, refreshing them before the 2-week expiry.
 * https://github.com/basecamp/bc-api/blob/master/sections/authentication.md
 */

const LAUNCHPAD = 'https://launchpad.37signals.com'
const USER_AGENT = 'AppSignal Webhooks (ed@iqthink.com)'
const TOKENS_KEY = 'basecamp:tokens'
const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000

type StoredTokens = {
  access_token: string
  refresh_token: string
  expires_at: number
}

type TokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in: number
}

export function authorizationUrl(env: Bindings, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.BASECAMP_CLIENT_ID,
    redirect_uri: redirectUri,
    state,
  })
  return `${LAUNCHPAD}/authorization/new?${params}`
}

async function requestTokens(params: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(`${LAUNCHPAD}/authorization/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
    body: params,
  })
  if (!res.ok) {
    throw new Error(`Basecamp token request failed (${res.status}): ${await res.text()}`)
  }
  return res.json()
}

async function storeTokens(env: Bindings, tokens: TokenResponse, previousRefreshToken?: string) {
  const stored: StoredTokens = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? previousRefreshToken ?? '',
    expires_at: Date.now() + tokens.expires_in * 1000,
  }
  await env.KV.put(TOKENS_KEY, JSON.stringify(stored))
  return stored
}

export async function exchangeCode(env: Bindings, code: string, redirectUri: string) {
  const tokens = await requestTokens(
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: env.BASECAMP_CLIENT_ID,
      client_secret: env.BASECAMP_CLIENT_SECRET,
      redirect_uri: redirectUri,
      code,
    })
  )
  return storeTokens(env, tokens)
}

async function refreshTokens(env: Bindings, current: StoredTokens) {
  const tokens = await requestTokens(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: current.refresh_token,
      client_id: env.BASECAMP_CLIENT_ID,
      client_secret: env.BASECAMP_CLIENT_SECRET,
    })
  )
  return storeTokens(env, tokens, current.refresh_token)
}

async function getAccessToken(env: Bindings, forceRefresh = false): Promise<string> {
  const raw = await env.KV.get(TOKENS_KEY)
  if (!raw) {
    throw new Error('Basecamp is not authorized yet. Visit /auth?key=<SETUP_KEY> to connect.')
  }
  let tokens: StoredTokens = JSON.parse(raw)
  if (forceRefresh || Date.now() > tokens.expires_at - REFRESH_MARGIN_MS) {
    tokens = await refreshTokens(env, tokens)
  }
  return tokens.access_token
}

function client(env: Bindings, accessToken: string) {
  return createBasecampClient({ accountId: env.BASECAMP_ACCOUNT_ID, accessToken })
}

export async function createCard(
  env: Bindings,
  card: { title: string; content: string }
): Promise<Card> {
  const columnId = Number(env.BASECAMP_COLUMN_ID)
  try {
    return await client(env, await getAccessToken(env)).cards.create(columnId, card)
  } catch (err) {
    if (isErrorCode(err, 'auth_required')) {
      return client(env, await getAccessToken(env, true)).cards.create(columnId, card)
    }
    throw err
  }
}
