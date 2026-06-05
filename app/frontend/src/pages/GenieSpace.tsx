import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  askGenieStream,
  getGenieSpace,
  type GenieQueryResult,
  type GenieSpaceInfo,
  type GenieStep,
} from '../api'
import { LoadingIndicator } from '../components/LoadingIndicator'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import './GenieSpace.css'

const CHART_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#61BA43', '#A855F7', '#F472B6']

function isNumericLike(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return false
  if (typeof v === 'number') return Number.isFinite(v)
  if (typeof v === 'boolean') return false
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n)
  }
  return false
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function isDateLike(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return false
  if (typeof v !== 'string') return false
  // ISO-ish dates / timestamps
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(v)) {
    const d = Date.parse(v)
    return !Number.isNaN(d)
  }
  return false
}

type ChartSpec =
  | { kind: 'line' | 'bar'; data: Record<string, unknown>[]; xKey: string; yKeys: string[] }
  | { kind: 'pie'; data: { name: string; value: number }[]; xKey: string; yKeys: string[] }

const MAX_CHART_SERIES = 12

function pivotLongFormat(
  query: GenieQueryResult,
  dateCol: string,
  seriesCol: string,
  valueCol: string,
): { data: Record<string, unknown>[]; yKeys: string[] } | null {
  const colIdx: Record<string, number> = {}
  query.columns.forEach((c, i) => {
    colIdx[c] = i
  })
  const dateI = colIdx[dateCol]
  const seriesI = colIdx[seriesCol]
  const valueI = colIdx[valueCol]

  const buckets = new Map<string, Record<string, unknown>>()
  const seriesKeys: string[] = []
  const seriesSeen = new Set<string>()

  for (const r of query.rows) {
    const dateRaw = r[dateI]
    const seriesRaw = r[seriesI]
    if (dateRaw === null || dateRaw === undefined || dateRaw === '') continue
    if (seriesRaw === null || seriesRaw === undefined || seriesRaw === '') continue
    const dateKey = String(dateRaw)
    const seriesKey = String(seriesRaw)
    let bucket = buckets.get(dateKey)
    if (!bucket) {
      bucket = { [dateCol]: dateKey }
      buckets.set(dateKey, bucket)
    }
    const v = r[valueI]
    bucket[seriesKey] = v === null || v === undefined || v === '' ? null : toNumber(v)
    if (!seriesSeen.has(seriesKey)) {
      seriesSeen.add(seriesKey)
      seriesKeys.push(seriesKey)
    }
  }

  if (seriesKeys.length === 0 || seriesKeys.length > MAX_CHART_SERIES) return null
  const data = Array.from(buckets.values()).sort((a, b) =>
    String(a[dateCol]).localeCompare(String(b[dateCol])),
  )
  if (data.length === 0) return null
  return { data, yKeys: seriesKeys }
}

function detectChart(query: GenieQueryResult): ChartSpec | null {
  if (!query || query.columns.length < 2 || query.rows.length < 1) return null

  // Classify each column: numeric (every non-null value parses as a number) vs not.
  const numericCols: string[] = []
  const nonNumericCols: string[] = []
  const dateCols: string[] = []
  for (let i = 0; i < query.columns.length; i++) {
    const col = query.columns[i]
    let sawValue = false
    let allNumeric = true
    let allDateOrNull = true
    let sawDate = false
    for (const r of query.rows) {
      const v = r[i]
      if (v === null || v === undefined || v === '') continue
      sawValue = true
      if (!isNumericLike(v)) allNumeric = false
      if (isDateLike(v)) sawDate = true
      else allDateOrNull = false
    }
    if (sawValue && allNumeric) numericCols.push(col)
    else nonNumericCols.push(col)
    if (sawDate && allDateOrNull) dateCols.push(col)
  }

  if (numericCols.length === 0) return null

  // Long-format pivot: 1 date column + 1 categorical column + 1 numeric column
  // → multi-series line chart with one line per category.
  if (dateCols.length >= 1 && numericCols.length === 1) {
    const dateCol = dateCols[0]
    const valueCol = numericCols[0]
    const seriesCol = nonNumericCols.find((c) => c !== dateCol)
    if (seriesCol) {
      const pivoted = pivotLongFormat(query, dateCol, seriesCol, valueCol)
      if (pivoted) {
        return { kind: 'line', data: pivoted.data, xKey: dateCol, yKeys: pivoted.yKeys }
      }
    }
  }

  // X axis: first non-numeric column when present, else first column overall.
  const xKey = nonNumericCols[0] ?? query.columns[0]
  const yKeys = numericCols.filter((k) => k !== xKey)
  if (yKeys.length === 0) return null

  const colIdx: Record<string, number> = {}
  query.columns.forEach((c, i) => {
    colIdx[c] = i
  })

  const data: Record<string, unknown>[] = query.rows.map((r) => {
    const obj: Record<string, unknown> = {}
    const xRaw = r[colIdx[xKey]]
    obj[xKey] = xRaw === null || xRaw === undefined ? '' : String(xRaw)
    yKeys.forEach((k) => {
      const v = r[colIdx[k]]
      obj[k] = v === null || v === undefined || v === '' ? null : toNumber(v)
    })
    return obj
  })

  const xLooksDate = query.rows.every((r) => {
    const v = r[colIdx[xKey]]
    return v === null || v === undefined || v === '' || isDateLike(v)
  })
  if (xLooksDate) return { kind: 'line', data, xKey, yKeys }

  // Single-series + few categories → pie
  if (yKeys.length === 1 && data.length > 0 && data.length <= 8) {
    const yKey = yKeys[0]
    const pieData = data.map((d) => ({
      name: String(d[xKey] ?? ''),
      value: toNumber(d[yKey]),
    }))
    if (pieData.every((p) => p.value > 0)) {
      return { kind: 'pie', data: pieData, xKey, yKeys }
    }
  }

  return { kind: 'bar', data, xKey, yKeys }
}

function formatDateTick(v: unknown): string {
  const s = typeof v === 'string' ? v : String(v ?? '')
  if (!s) return ''
  // Trim ISO datetimes to the date portion when there's no useful time-of-day info.
  const m = s.match(/^(\d{4}-\d{2}-\d{2})([T ]00:00(:00)?(\.0+)?(Z|[+-]00:?00)?)?$/)
  return m ? m[1] : s.length > 16 ? s.slice(0, 16) : s
}

function GenieChart({ spec }: { spec: ChartSpec }) {
  if (spec.kind === 'pie') {
    return (
      <div className="genie__chart genie__chart--pie">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={spec.data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={90}
              label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
            >
              {spec.data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    )
  }
  if (spec.kind === 'line') {
    return (
      <div className="genie__chart genie__chart--cartesian">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={spec.data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey={spec.xKey} stroke="#94a3b8" tick={{ fontSize: 12 }} tickFormatter={formatDateTick} />
            <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            {spec.yKeys.map((k, i) => (
              <Line
                key={k}
                type="monotone"
                dataKey={k}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    )
  }
  return (
    <div className="genie__chart genie__chart--cartesian">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={spec.data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey={spec.xKey} stroke="#94a3b8" tick={{ fontSize: 12 }} />
          <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          {spec.yKeys.map((k, i) => (
            <Bar key={k} dataKey={k} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function GenieMarkdown({ children }: { children: string }) {
  return (
    <div className="genie__md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: c, ...rest }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
              {c}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

type Turn =
  | { role: 'user'; text: string }
  | {
      role: 'genie'
      text?: string | null
      query?: GenieQueryResult | null
      steps?: GenieStep[]
      followups?: string[]
      error?: string | null
      status?: string
      streaming?: boolean
    }

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: 'Sending your question',
  IN_PROGRESS: 'Working on it',
  FILTERING_CONTEXT: 'Reading your data context',
  ASKING_AI: 'Thinking',
  EXECUTING_QUERY: 'Running the query',
  FETCHING_METADATA: 'Fetching metadata',
  PENDING_WAREHOUSE: 'Waiting for the SQL warehouse',
  COMPLETED: 'Done',
  FAILED: 'Genie ran into an error',
  CANCELLED: 'Cancelled',
  QUERY_RESULT_EXPIRED: 'Query result expired',
}

function humanizeStatus(s?: string): string {
  if (!s) return 'Working'
  // Defensive: strip "MessageStatus." style enum prefixes if the backend leaks them.
  const bare = (s.includes('.') ? s.split('.').pop()! : s).toUpperCase()
  if (STATUS_LABEL[bare]) return STATUS_LABEL[bare]
  return bare
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function StepList({ steps }: { steps: GenieStep[] }) {
  return (
    <ol className="genie__stepsList">
      {steps.map((s, i) => (
        <li key={i} className={`genie__step genie__step--${s.type}`}>
          <div className="genie__stepHead">
            <span className="genie__stepBadge">{s.type === 'query' ? 'SQL' : 'Text'}</span>
            {s.title ? <span className="genie__stepTitle">{s.title}</span> : null}
          </div>
          {s.description ? <div className="genie__stepDesc">{s.description}</div> : null}
          {s.content ? <div className="genie__stepContent">{s.content}</div> : null}
          {s.statement ? <pre className="genie__stepSql">{s.statement}</pre> : null}
          {s.row_count !== null && s.row_count !== undefined ? (
            <div className="genie__stepMeta">{s.row_count} row{s.row_count === 1 ? '' : 's'}</div>
          ) : null}
        </li>
      ))}
    </ol>
  )
}

function StepsBlock({ steps, streaming }: { steps: GenieStep[]; streaming?: boolean }) {
  if (!steps || steps.length === 0) return null
  if (streaming) {
    return (
      <div className="genie__steps genie__steps--live">
        <div className="genie__stepsHead">
          Thought steps <span className="genie__stepsCount">({steps.length})</span>
        </div>
        <div className="content">
          <StepList steps={steps} />
        </div>
      </div>
    )
  }
  return (
    <details className="genie__steps">
      <summary>
        Show thought steps <span className="genie__stepsCount">({steps.length})</span>
      </summary>
      <div className="content">
        <StepList steps={steps} />
      </div>
    </details>
  )
}

function QueryResultTable({ query }: { query: GenieQueryResult }) {
  if (!query.columns.length) return null
  type Row = Record<string, unknown>
  const rows: Row[] = query.rows.map((r) => {
    const obj: Row = {}
    query.columns.forEach((c, i) => {
      obj[c] = r[i]
    })
    return obj
  })
  const columns: DataTableColumn<Row>[] = query.columns.map((c) => ({
    id: c,
    header: c,
    cell: (row) => {
      const v = row[c]
      if (v === null || v === undefined) return ''
      if (typeof v === 'object') return JSON.stringify(v)
      return String(v)
    },
  }))
  return <DataTable rows={rows} columns={columns} rowKey={(_, i) => String(i)} />
}

function QueryResultBlock({ query }: { query: GenieQueryResult }) {
  const chartSpec = useMemo(() => detectChart(query), [query])
  const [view, setView] = useState<'chart' | 'table'>(chartSpec ? 'chart' : 'table')

  if (!query.columns.length) return null

  return (
    <div className="genie__rows">
      {chartSpec ? (
        <div className="genie__viewToggle" role="tablist" aria-label="Result view">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'chart'}
            className={`genie__viewBtn${view === 'chart' ? ' genie__viewBtn--active' : ''}`}
            onClick={() => setView('chart')}
          >
            Chart
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'table'}
            className={`genie__viewBtn${view === 'table' ? ' genie__viewBtn--active' : ''}`}
            onClick={() => setView('table')}
          >
            Table
          </button>
        </div>
      ) : null}
      {chartSpec && view === 'chart' ? <GenieChart spec={chartSpec} /> : <QueryResultTable query={query} />}
      {query.truncated ? (
        <div className="genie__truncated">
          Showing first {query.rows.length} of {query.row_count} rows.
        </div>
      ) : null}
    </div>
  )
}

function FollowupChips({
  followups,
}: {
  followups: string[]
}) {
  if (!followups || followups.length === 0) return null
  return (
    <div className="genie__followups">
      <div className="genie__followupsLabel">Follow-up questions</div>
      <div className="genie__followupChips">
        {followups.map((q, i) => (
          <div
            key={i}
            className="genie__followupChip"
            title={q}
          >
            <span className="genie__followupChipText">{q}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function GenieBubble({
  turn,
}: {
  turn: Extract<Turn, { role: 'genie' }>
}) {
  const cls = `genie__bubble genie__bubble--genie${turn.error ? ' genie__bubble--error' : ''}`
  const showLiveStatus = turn.streaming && !turn.error
  return (
    <div className={cls}>
      {showLiveStatus ? (
        <div className="genie__liveStatus">
          <LoadingIndicator size={16} color="#94a3b8" />
          <span>{humanizeStatus(turn.status)}…</span>
        </div>
      ) : null}
      {turn.error ? (
        <div>{turn.error}</div>
      ) : (
        <>
          {turn.text ? <GenieMarkdown>{turn.text}</GenieMarkdown> : null}
          {turn.query ? (
            <>
              {turn.query.columns.length > 0 ? (
                <details className="genie__queryResult" open={true}>
                  <summary>Show query result</summary>
                  <div className="content">
                    <QueryResultBlock query={turn.query} />
                  </div>
                </details>) : null}
              {turn.query.statement ? (
                <details className="genie__sql">
                  <summary>Show SQL</summary>
                  <div className="content">
                    <pre className="genie__sqlCode">{turn.query.statement}</pre>
                  </div>
                </details>
              ) : null}
            </>
          ) : null}
          {!turn.streaming && !turn.text && !turn.query ? (
            <div style={{ color: 'var(--text-muted)' }}>
              {turn.status ? `(${turn.status})` : '(no response)'}
            </div>
          ) : null}
          {turn.steps && turn.steps.length > 0 ? (
            <StepsBlock steps={turn.steps} streaming={turn.streaming} />
          ) : null}
          {!turn.streaming && turn.followups && turn.followups.length > 0 ? (
            <FollowupChips followups={turn.followups} />
          ) : null}
        </>
      )}
    </div>
  )
}

export default function GenieSpace() {
  const [turns, setTurns] = useState<Turn[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [spaceInfo, setSpaceInfo] = useState<GenieSpaceInfo | null>(null)
  const [spaceError, setSpaceError] = useState<string | null>(null)
  const messagesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getGenieSpace()
      .then((info) => {
        setSpaceInfo(info)
        setSpaceError(null)
      })
      .catch((e) => {
        setSpaceInfo({ space_id: '', configured: false })
        setSpaceError(String(e?.message || e))
      })
  }, [])

  useEffect(() => {
    const el = messagesRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns, loading])

  async function send(textOverride?: string) {
    const q = (textOverride ?? input).trim()
    if (!q || loading) return
    if (textOverride === undefined) setInput('')
    setLoading(true)
    // Add the user turn + a streaming Genie placeholder. The Genie placeholder
    // will be the LAST entry; we mutate it as SSE events arrive.
    setTurns((prev) => [
      ...prev,
      { role: 'user', text: q },
      { role: 'genie', streaming: true, steps: [], status: 'SUBMITTED' },
    ])

    const updateLastGenie = (
      patch: Partial<Extract<Turn, { role: 'genie' }>> | ((t: Extract<Turn, { role: 'genie' }>) => Partial<Extract<Turn, { role: 'genie' }>>),
    ) => {
      setTurns((prev) => {
        const next = prev.slice()
        for (let i = next.length - 1; i >= 0; i--) {
          const t = next[i]
          if (t.role === 'genie') {
            const p = typeof patch === 'function' ? patch(t) : patch
            next[i] = { ...t, ...p }
            break
          }
        }
        return next
      })
    }

    try {
      await askGenieStream(q, conversationId, (evt) => {
        if (evt.type === 'started') {
          if (evt.conversation_id) setConversationId(evt.conversation_id)
        } else if (evt.type === 'status') {
          updateLastGenie({ status: evt.status })
        } else if (evt.type === 'step') {
          updateLastGenie((t) => ({ steps: [...(t.steps ?? []), evt.step] }))
        } else if (evt.type === 'final') {
          const r = evt.response
          if (r.conversation_id) setConversationId(r.conversation_id)
          updateLastGenie({
            streaming: false,
            text: r.text,
            query: r.query,
            steps: r.steps,
            followups: r.followups ?? [],
            status: r.status,
            error: r.error,
          })
        } else if (evt.type === 'error') {
          updateLastGenie({ streaming: false, error: evt.error })
        }
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      updateLastGenie({ streaming: false, error: msg })
    } finally {
      setLoading(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function newConversation() {
    if (loading) return
    setTurns([])
    setConversationId(null)
  }

  const configured = spaceInfo?.configured ?? false
  const spaceId = spaceInfo?.space_id || ''

  return (
    <div className="genie">
      <div className="genie__header">
        <div>
          <h1 className="genie__title">Genie Space</h1>
          <div className="genie__sub">
            {configured ? (
              <>
                Ask questions about your governance data. Space: <code>{spaceId}</code>
              </>
            ) : (
              <>No Genie space configured.</>
            )}
          </div>
        </div>
        <button
          type="button"
          className="genie__newBtn"
          onClick={newConversation}
          disabled={loading || turns.length === 0}
          title="Clear and start a new Genie conversation"
        >
          New conversation
        </button>
      </div>

      {!configured ? (
        <div className="genie__warn">
          Set <code>GENIE_SPACE_ID</code> in <code>app.yaml</code> (or save a value to localStorage
          key <code>governbot_genie_space_id</code>) to enable this page.
          {spaceError ? <div style={{ marginTop: 4 }}>{spaceError}</div> : null}
        </div>
      ) : null}

      <div className="genie__messages" ref={messagesRef}>
        {turns.length === 0 ? (
          <div className="genie__empty">
            <h3>Ask Genie anything about your governance data</h3>
            <p>
              Try: &ldquo;How many violations were created in the last 24 hours?&rdquo; or
              &ldquo;Break down pending violations by workspace.&rdquo;
            </p>
          </div>
        ) : (
          turns.map((t, i) =>
            t.role === 'user' ? (
              <div key={i} className="genie__bubble genie__bubble--user">
                {t.text}
              </div>
            ) : (
              <GenieBubble key={i} turn={t} />
            ),
          )
        )}
      </div>

      <div className="genie__composer">
        <textarea
          className="genie__textarea"
          placeholder={configured ? 'Ask Genie a question…' : 'Configure GENIE_SPACE_ID to chat'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={!configured || loading}
          rows={2}
        />
        <button
          type="button"
          className="genie__sendBtn"
          onClick={() => send()}
          disabled={!configured || loading || !input.trim()}
        >
          {loading ? <LoadingIndicator size={16} color="#0F172A" /> : null}
          Send
        </button>
      </div>
    </div>
  )
}
