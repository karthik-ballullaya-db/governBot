const API_BASE = '';

export type AppConfig = { catalog: string; schema: string; warehouse_http_path: string };

function headers(): Record<string, string> {
  const catalog = localStorage.getItem('governbot_catalog') || '';
  const schema = localStorage.getItem('governbot_schema') || '';
  const path = localStorage.getItem('governbot_warehouse_http_path') || '';
  const genieSpaceId = localStorage.getItem('governbot_genie_space_id') || '';
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (catalog) h['X-Catalog'] = catalog;
  if (schema) h['X-Schema'] = schema;
  if (path) h['X-Warehouse-HTTP-Path'] = path;
  if (genieSpaceId) h['X-Genie-Space-Id'] = genieSpaceId;
  return h;
}

export async function getConfig(): Promise<AppConfig> {
  const r = await fetch(`${API_BASE}/api/config`, { headers: headers() });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export type MeResponse = { email: string; name: string; given_name?: string | null };

export async function getMe(): Promise<MeResponse> {
  const r = await fetch(`${API_BASE}/api/me`, { headers: headers(), credentials: 'include' });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export type SummaryResponse = {
  total: number;
  pending: number;
  completed: number;
  total_previous: number;
  pending_previous: number;
  completed_previous: number;
  /** (current - previous) / previous * 100; null when previous is 0 and current > 0 */
  pct_change_total: number | null;
  pct_change_pending: number | null;
  pct_change_completed: number | null;
  by_type: { name: string; count: number }[];
  by_object_type: { name: string; count: number }[];
  by_type_previous: { name: string; count: number }[];
  by_object_type_previous: { name: string; count: number }[];
  latest: Record<string, unknown>[];
};

export type SummaryTrendResponse = {
  trend: { period: string; generated: number; failed: number; completed: number }[];
};

export async function getSummary(hours: number, remediationType: string): Promise<SummaryResponse> {
  const r = await fetch(`${API_BASE}/api/summary?hours=${hours}&remediation_type=${remediationType}`, { headers: headers() });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getSummaryTrend(
  hours: number,
  remediationType: string,
  window: 'current' | 'previous' = 'current',
): Promise<SummaryTrendResponse> {
  const w = encodeURIComponent(window);
  const r = await fetch(
    `${API_BASE}/api/summary/trend?hours=${hours}&remediation_type=${encodeURIComponent(remediationType)}&window=${w}`,
    { headers: headers() },
  );
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export type ActionRow = Record<string, unknown>;

export async function getActions(filters?: {
  workspace?: string;
  violation_type?: string;
  remediation_action?: string;
}): Promise<{ rows: ActionRow[] }> {
  const params = new URLSearchParams();
  if (filters?.workspace && filters.workspace !== '(all)') params.set('workspace', filters.workspace);
  if (filters?.violation_type && filters.violation_type !== '(all)') params.set('violation_type', filters.violation_type);
  if (filters?.remediation_action && filters.remediation_action !== '(all)') params.set('remediation_action', filters.remediation_action);
  const r = await fetch(`${API_BASE}/api/actions?${params}`, { headers: headers() });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function approveViolation(violationId: string, note?: string): Promise<void> {
  const r = await fetch(`${API_BASE}/api/actions/approve`, {
    method: 'POST',
    headers: { ...headers(), 'X-Violation-Id': violationId },
    body: JSON.stringify({ note: note || '' }),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function rejectViolation(violationId: string, reason: string): Promise<void> {
  const r = await fetch(`${API_BASE}/api/actions/reject`, {
    method: 'POST',
    headers: { ...headers(), 'X-Violation-Id': violationId },
    body: JSON.stringify({ reason }),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function addNoteViolation(violationId: string, note: string): Promise<void> {
  const r = await fetch(`${API_BASE}/api/actions/note`, {
    method: 'POST',
    headers: { ...headers(), 'X-Violation-Id': violationId },
    body: JSON.stringify({ note }),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function bulkAcknowledgeViolations(violationIds: string[], note?: string): Promise<void> {
  const r = await fetch(`${API_BASE}/api/actions/bulk-acknowledge`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ violation_ids: violationIds, note: note ?? '' }),
  });
  if (!r.ok) throw new Error(await r.text());
} 

export type ConfigFormOptions = {
  workspace_object_types: string[];
  violation_types: string[];
  remediation_actions: string[];
  /** Keys are group names (e.g. ALL, UC_ALL); values are expanded object types (mirrors governbot_core.constants.APPROVED_ACTION_GROUPS). */
  approved_action_groups: Record<string, string[]>;
};

let configFormOptionsPromise: Promise<ConfigFormOptions> | null = null;

/** Cached GET /api/configs/form-options (same-origin; headers optional for this route). */
export function getConfigFormOptionsCached(): Promise<ConfigFormOptions> {
  if (!configFormOptionsPromise) {
    const p = fetch(`${API_BASE}/api/configs/form-options`, { headers: headers() }).then(async (r) => {
      if (!r.ok) throw new Error(await r.text());
      return (await r.json()) as ConfigFormOptions;
    });
    configFormOptionsPromise = p.catch((e) => {
      configFormOptionsPromise = null;
      throw e;
    });
  }
  return configFormOptionsPromise;
}

export async function getWorkspaces(): Promise<{ rows: Record<string, unknown>[] }> {
  const r = await fetch(`${API_BASE}/api/configs/workspaces`, { headers: headers() });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createWorkspace(body: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${API_BASE}/api/configs/workspaces`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function updateWorkspace(workspaceId: string, body: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${API_BASE}/api/configs/workspaces/${encodeURIComponent(workspaceId)}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const r = await fetch(`${API_BASE}/api/configs/workspaces/${encodeURIComponent(workspaceId)}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function getIdentities(): Promise<{ rows: Record<string, unknown>[] }> {
  const r = await fetch(`${API_BASE}/api/configs/identities`, { headers: headers() });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createIdentity(body: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${API_BASE}/api/configs/identities`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function updateIdentity(identityName: string, identityType: string, body: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${API_BASE}/api/configs/identities/${encodeURIComponent(identityName)}`, {
    method: 'PUT',
    headers: { ...headers(), 'X-Identity-Type': identityType },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function deleteIdentity(identityName: string, identityType: string): Promise<void> {
  const r = await fetch(`${API_BASE}/api/configs/identities/${encodeURIComponent(identityName)}`, {
    method: 'DELETE',
    headers: { ...headers(), 'X-Identity-Type': identityType },
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function getFilters(): Promise<{ rows: Record<string, unknown>[] }> {
  const r = await fetch(`${API_BASE}/api/configs/filters`, { headers: headers() });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createFilter(body: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${API_BASE}/api/configs/filters`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function updateFilter(filterId: string, body: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${API_BASE}/api/configs/filters/${encodeURIComponent(filterId)}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function deleteFilter(filterId: string): Promise<void> {
  const r = await fetch(`${API_BASE}/api/configs/filters/${encodeURIComponent(filterId)}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!r.ok) throw new Error(await r.text());
}

export type GenieSpaceInfo = { space_id: string; configured: boolean };

export type GenieQueryResult = {
  statement: string;
  columns: string[];
  rows: unknown[][];
  row_count: number;
  truncated: boolean;
};

export type GenieStep = {
  type: 'text' | 'query';
  title: string | null;
  description: string | null;
  content: string | null;
  statement: string | null;
  row_count: number | null;
};

export type GenieAskResponse = {
  conversation_id: string;
  message_id: string;
  status: string;
  text: string | null;
  query: GenieQueryResult | null;
  steps: GenieStep[];
  followups: string[];
  error: string | null;
};

export async function getGenieSpace(): Promise<GenieSpaceInfo> {
  const r = await fetch(`${API_BASE}/api/genie/space`, { headers: headers() });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function askGenie(
  question: string,
  conversationId?: string | null,
): Promise<GenieAskResponse> {
  const r = await fetch(`${API_BASE}/api/genie/ask`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ question, conversation_id: conversationId ?? null }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export type GenieStreamEvent =
  | { type: 'started'; conversation_id: string; message_id: string }
  | { type: 'status'; status: string }
  | { type: 'step'; step: GenieStep }
  | { type: 'final'; response: GenieAskResponse }
  | { type: 'error'; error: string };

export async function askGenieStream(
  question: string,
  conversationId: string | null,
  onEvent: (event: GenieStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const r = await fetch(`${API_BASE}/api/genie/ask/stream`, {
    method: 'POST',
    headers: { ...headers(), Accept: 'text/event-stream' },
    body: JSON.stringify({ question, conversation_id: conversationId ?? null }),
    signal,
  });
  if (!r.ok || !r.body) {
    const text = await r.text().catch(() => '');
    throw new Error(text || `HTTP ${r.status}`);
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep = buffer.indexOf('\n\n');
    while (sep >= 0) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      sep = buffer.indexOf('\n\n');
      const dataLines = block
        .split('\n')
        .filter((l) => l.startsWith('data: '))
        .map((l) => l.slice(6));
      if (dataLines.length === 0) continue;
      const payload = dataLines.join('\n').trim();
      if (!payload) continue;
      try {
        const evt = JSON.parse(payload) as GenieStreamEvent;
        onEvent(evt);
      } catch {
        // skip malformed
      }
    }
  }
}
