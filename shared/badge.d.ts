export const APPROVED_BADGE_COLORS: Set<string>
export const DEFAULT_BADGE_COLOR: string
export function resolveBadgeColor(color: unknown): string
export function escapeXml(unsafe: unknown): string
export function estimateTextWidth(text: string): number
export function renderBadgeSvg(options: {
  label?: string
  value: string
  statusColor?: string
  title?: string | null
}): string
