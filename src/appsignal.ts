/**
 * AppSignal webhook signature verification.
 *
 * AppSignal signs each request with SHA256(token + rawBody) and
 * sends the hex digest in the `X-Appsignal-Signature` header.
 * https://docs.appsignal.com/application/integrations/webhooks.html
 */

async function sha256Hex(message: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function verifySignature(
  rawBody: string,
  signature: string | undefined,
  tokensCsv: string | undefined
): Promise<boolean> {
  if (!signature || !tokensCsv) return false
  const tokens = tokensCsv
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)

  for (const token of tokens) {
    const expected = await sha256Hex(token + rawBody)
    if (timingSafeEqual(expected, signature.toLowerCase())) return true
  }
  return false
}
