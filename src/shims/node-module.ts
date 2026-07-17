/**
 * Bundler shim for `node:module`, aliased in wrangler.jsonc.
 *
 * The Basecamp SDK loads its OpenAPI metadata with
 * `createRequire(import.meta.url)("…/generated/metadata.json")`, which crashes
 * in workerd because `import.meta.url` is undefined after bundling and the
 * runtime has no filesystem. This shim inlines that JSON at build time and
 * serves it to the SDK's require calls instead.
 */

import metadata from '../../node_modules/@37signals/basecamp/dist/generated/metadata.json'

export function createRequire(_url: unknown) {
  return (path: string) => {
    if (path.endsWith('metadata.json')) return metadata
    throw new Error(`node:module shim cannot require "${path}"`)
  }
}

export default { createRequire }
