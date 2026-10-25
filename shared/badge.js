/**
 * Approved health-grade badge colors.
 */
export const APPROVED_BADGE_COLORS = new Set([
  '#58A65C',
  '#87966A',
  '#D4A373',
  '#C96A45',
  '#7A7870',
])

export const DEFAULT_BADGE_COLOR = '#87966A'

/**
 * Validate and resolve the badge color against the approved palette.
 * Falls back to #87966A if the color is invalid, unauthorized, or malformed.
 * @param {unknown} color
 * @returns {string} Safe hex color
 */
export function resolveBadgeColor(color) {
  if (typeof color === 'string') {
    const upper = color.toUpperCase()
    if (APPROVED_BADGE_COLORS.has(upper)) {
      return upper
    }
  }
  return DEFAULT_BADGE_COLOR
}

/**
 * Escape XML special characters to prevent SVG injection / XSS.
 * @param {unknown} unsafe
 * @returns {string}
 */
export function escapeXml(unsafe) {
  if (unsafe == null) return ''
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Estimate text width in pixels for an 11px system font.
 * @param {string} text
 * @returns {number}
 */
export function estimateTextWidth(text) {
  if (!text) return 0
  let width = 0
  for (const ch of String(text)) {
    if (ch === ' ' || ch === '.' || ch === ',' || ch === ':' || ch === ';' || ch === '|' || ch === '!' || ch === 'i' || ch === 'l' || ch === '1') {
      width += 4.5
    } else if (ch === 'r' || ch === 't' || ch === 'f' || ch === 'j' || ch === '(' || ch === ')' || ch === '[' || ch === ']') {
      width += 5.5
    } else if (ch === 'm' || ch === 'w' || ch === 'M' || ch === 'W' || ch === '@' || ch === '%') {
      width += 9.5
    } else if (ch >= 'A' && ch <= 'Z') {
      width += 7.5
    } else {
      width += 6.5
    }
  }
  return width
}

/**
 * Render a lightweight, standards-compliant SVG badge for Arsenic health scores and error states.
 * @param {object} options
 * @param {string} [options.label='arsenic']
 * @param {string} options.value
 * @param {string} [options.statusColor='#87966A']
 * @param {string} [options.title]
 * @returns {string} SVG markup
 */
export function renderBadgeSvg({
  label = 'arsenic',
  value = '0',
  statusColor = '#87966A',
  title = null
}) {
  const safeLabel = escapeXml(label)
  const safeValue = escapeXml(value)
  const safeColor = resolveBadgeColor(statusColor)
  const safeTitle = escapeXml(title || `${label}: ${value}`)

  const leftTextWidth = estimateTextWidth(label)
  const leftWidth = Math.max(38, Math.round(leftTextWidth + 14))
  const rightTextWidth = estimateTextWidth(value)
  const rightWidth = Math.max(30, Math.round(rightTextWidth + 14))
  const totalWidth = leftWidth + rightWidth

  const leftTextX = Math.round((leftWidth / 2) * 10)
  const rightTextX = Math.round((leftWidth + rightWidth / 2) * 10)
  const leftTextLength = Math.round(leftTextWidth * 10)
  const rightTextLength = Math.round(rightTextWidth * 10)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" viewBox="0 0 ${totalWidth} 20" role="img" aria-label="${safeTitle}">
  <title>${safeTitle}</title>
  <linearGradient id="_a" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="_r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#_r)">
    <rect width="${leftWidth}" height="20" fill="#181816"/>
    <rect x="${leftWidth}" width="${rightWidth}" height="20" fill="${safeColor}"/>
    <rect width="${totalWidth}" height="20" fill="url(#_a)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif" text-rendering="geometricPrecision" font-size="110">
    <text aria-hidden="true" x="${leftTextX}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${leftTextLength}">${safeLabel}</text>
    <text x="${leftTextX}" y="140" transform="scale(.1)" fill="#EDE8E1" textLength="${leftTextLength}">${safeLabel}</text>
    <text aria-hidden="true" x="${rightTextX}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${rightTextLength}">${safeValue}</text>
    <text x="${rightTextX}" y="140" transform="scale(.1)" fill="#fff" textLength="${rightTextLength}">${safeValue}</text>
  </g>
</svg>`
}
