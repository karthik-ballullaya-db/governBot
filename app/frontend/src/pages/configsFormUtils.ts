export function arrFrom(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String).filter(Boolean)
  if (typeof val === 'string') return val.split(',').map((s) => s.trim()).filter(Boolean)
  return []
}

export function arrToStr(arr: string[]): string {
  return Array.isArray(arr) ? arr.join(', ') : ''
}

export type WorkspaceRow = Record<string, unknown>
export type IdentityRow = Record<string, unknown>
export type FilterRow = Record<string, unknown>

/** Compare expanded object-type sets (order-insensitive). */
function normalizeMemberSet(arr: string[]): string {
  return [...new Set(arr.map((s) => String(s).trim()).filter(Boolean))].sort().join('\u0000')
}

/**
 * Map stored approved_actions from the table to an APPROVED_ACTION_GROUPS key when possible.
 * Matches expanded member sets or a single stored alias that is itself a group key.
 */
export function resolveApprovedActionGroupKey(
  stored: string[],
  groups: Record<string, string[]>
): string | null {
  const cleaned = [...new Set(stored.map((s) => String(s).trim()).filter(Boolean))]
  if (cleaned.length === 0) return null

  const nStored = normalizeMemberSet(cleaned)
  for (const key of Object.keys(groups)) {
    if (normalizeMemberSet(groups[key]) === nStored) return key
  }

  if (cleaned.length === 1) {
    const k = cleaned[0].toUpperCase()
    if (groups[k]) return k
  }
  return null
}

export function workspacePayloadFromRow(row: WorkspaceRow, overrides?: { enforcement_enabled?: boolean }) {
  const enforcement_enabled = overrides?.enforcement_enabled ?? Boolean(row.enforcement_enabled)
  return {
    workspace_id: String(row.workspace_id ?? ''),
    workspace_name: String(row.workspace_name ?? ''),
    workspace_url: String(row.workspace_url ?? ''),
    warehouse_id: row.warehouse_id ? String(row.warehouse_id) : null,
    enforcement_enabled,
    notification_email: row.notification_email ? String(row.notification_email) : null,
    notification_slack_webhook: row.notification_slack_webhook ? String(row.notification_slack_webhook) : null,
    enabled_object_types: arrFrom(row.enabled_object_types),
    max_retry_attempts: Number(row.max_retry_attempts) || 3,
    created_by: String(row.created_by ?? 'api'),
  }
}
