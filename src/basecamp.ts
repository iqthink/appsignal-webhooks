import type { Bindings } from './types'

/**
 * Basecamp OAuth2 + Card Tables API client.
 * https://github.com/basecamp/bc-api/blob/master/sections/authentication.md
 * https://github.com/basecamp/bc-api/blob/master/sections/card_table_cards.md
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
  const response = await fetch(`${LAUNCHPAD}/authorization/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
    body: params,
  })
  if (!response.ok) {
    throw new Error(`Basecamp token request failed (${response.status}): ${await response.text()}`)
  }
  return response.json()
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

export type CreatedCard = {
  id: number
  title: string
  app_url: string
}

export async function createCard(
  env: Bindings,
  card: { title: string; content: string }
): Promise<CreatedCard> {
  const url = `https://3.basecampapi.com/${env.BASECAMP_ACCOUNT_ID}/buckets/${env.BASECAMP_BUCKET_ID}/card_tables/lists/${env.BASECAMP_COLUMN_ID}/cards.json`

  const attempt = async (accessToken: string) =>
    fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify(card),
    })

  let response = await attempt(await getAccessToken(env))

  if (response.status === 401) {
    response = await attempt(await getAccessToken(env, true))
  }

  if (!response.ok) {
    throw new Error(`Basecamp card creation failed (${response.status}): ${await response.text()}`)
  }

  return response.json()
}
