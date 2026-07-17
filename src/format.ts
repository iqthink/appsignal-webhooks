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

export function cardTitle(exception: AppSignalException): string {
  const site = exception.site ?? 'Unknown app'
  const error = exception.exception ?? 'Error'
  const where = exception.action ? ` in ${exception.action}` : ''
  return `🚨 [${site}] ${error}${where}`
}

export function cardContent(exception: AppSignalException): string {
  const rows: string[] = []
  const row = (label: string, value: string | number | undefined) => {
    if (value !== undefined && value !== null && `${value}` !== '') {
      rows.push(`<div><strong>${label}:</strong> ${escapeHtml(`${value}`)}</div>`)
    }
  }

  row('Message', exception.message)
  row('App', exception.site)
  row('Environment', exception.environment)
  row('Action', exception.action)
  row('Namespace', exception.namespace)
  row('Host', exception.hostname)
  row('Revision', exception.revision)
  row('User', exception.user)
  row('Time', exception.time)
  row('Incident #', exception.number)

  if (exception.url) {
    rows.push('<br>')
    rows.push(`<div><a href="${escapeHtml(exception.url)}">View incident in AppSignal →</a></div>`)
  }

  const backtrace = exception.app_backtrace?.length
    ? exception.app_backtrace
    : exception.first_backtrace_line
      ? [exception.first_backtrace_line]
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
