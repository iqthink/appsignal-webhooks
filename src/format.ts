import type { AppSignalException } from './types'

/**
 * Builds the Basecamp card title and rich-text content for an AppSignal
 * exception incident. Basecamp cards accept a limited HTML subset:
 * https://github.com/basecamp/bc-api/blob/master/sections/rich_text.md
 */

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

const MAX_BACKTRACE_LINES = 10

export function cardTitle(ex: AppSignalException): string {
  const site = ex.site ?? 'Unknown app'
  const error = ex.exception ?? 'Error'
  const where = ex.action ? ` in ${ex.action}` : ''
  return `🚨 [${site}] ${error}${where}`
}

export function cardContent(ex: AppSignalException): string {
  const rows: string[] = []
  const row = (label: string, value: string | number | undefined) => {
    if (value !== undefined && value !== null && `${value}` !== '') {
      rows.push(`<div><strong>${label}:</strong> ${escapeHtml(`${value}`)}</div>`)
    }
  }

  row('Mensaje', ex.message)
  row('App', ex.site)
  row('Entorno', ex.environment)
  row('Acción', ex.action)
  row('Namespace', ex.namespace)
  row('Host', ex.hostname)
  row('Revisión', ex.revision)
  row('Usuario', ex.user)
  row('Fecha', ex.time)
  row('Incidente #', ex.number)

  if (ex.url) {
    rows.push('<br>')
    rows.push(`<div><a href="${escapeHtml(ex.url)}">Ver incidente en AppSignal →</a></div>`)
  }

  const backtrace = ex.app_backtrace?.length
    ? ex.app_backtrace
    : ex.first_backtrace_line
      ? [ex.first_backtrace_line]
      : []
  if (backtrace.length > 0) {
    const lines = backtrace.slice(0, MAX_BACKTRACE_LINES)
    const truncated = backtrace.length > lines.length ? '\n…' : ''
    rows.push('<br>')
    rows.push('<div><strong>Backtrace:</strong></div>')
    rows.push(`<pre>${escapeHtml(lines.join('\n'))}${truncated}</pre>`)
  }

  return rows.join('')
}
