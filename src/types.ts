export type Bindings = {
  KV: KVNamespace

  BASECAMP_ACCOUNT_ID: string
  BASECAMP_BUCKET_ID: string
  BASECAMP_COLUMN_ID: string

  BASECAMP_CLIENT_ID: string
  BASECAMP_CLIENT_SECRET: string
  /** Comma-separated list of AppSignal webhook verification tokens (one per app) */
  APPSIGNAL_WEBHOOK_TOKENS: string
  /** Shared key that protects the one-time OAuth setup endpoints */
  SETUP_KEY: string
}

export type AppSignalException = {
  time?: string
  number?: number
  site?: string
  environment?: string
  exception?: string
  message?: string
  action?: string
  namespace?: string
  hostname?: string
  revision?: string
  user?: string
  url?: string
  app_url?: string
  first_backtrace_line?: string
  app_backtrace?: string[]
  metadata?: Record<string, unknown>
}

export type AppSignalWebhookPayload = {
  exception?: AppSignalException
  performance?: unknown
  marker?: unknown
  alert_id?: unknown
}
