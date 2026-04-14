import { useState, useEffect, useRef } from 'react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Text,
} from 'recharts'
import { getSummary, getSummaryTrend, type SummaryResponse } from '../api'
import { GovernBotBrandMark } from '../components/GovernBotBrandMark'
import { ButtonWithIcon } from '../components/ButtonWithIcon'
import { LoadingIndicator } from '../components/LoadingIndicator'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { StatusPill } from '../components/StatusPill'
import './Summary.css'

type TrendPoint = { period: string; generated: number; failed: number; completed: number }
type CountByName = { name: string; count: number }

const HOURS_OPTIONS = [6, 12, 24, 48, 72, 360, 720]
const PIE_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#61BA43']
const REMEDIATION_TYPES = ['ALL', 'AUTOMATED', 'MANUAL']

function SummaryStatDelta({ pct, hours }: { pct: number | null; hours: number }) {
  if (pct === null) {
    return (
      <div className="summaryStatDelta summaryStatDelta--neutral" title="Previous window had zero count, so percent change is undefined.">
        No prior {hours}h baseline
      </div>
    )
  }
  if (pct === 0) {
    return <div className="summaryStatDelta summaryStatDelta--neutral">Same as prior {hours}h</div>
  }
  const down = pct < 0
  const arrow = down ? '↓' : '↑'
  const absPct = Math.abs(pct).toFixed(1)
  return (
    <div className={`summaryStatDelta ${down ? 'summaryStatDelta--down' : 'summaryStatDelta--up'}`}>
      {arrow} {absPct}% vs prior {hours}h
    </div>
  )
}

/** PDF capture only (off-screen): stacked current vs previous breakdowns. */
function SummaryPdfBreakdownCompare({
  hours,
  byTypeCurrent,
  byTypePrevious,
  byObjectCurrent,
  byObjectPrevious,
}: {
  hours: number
  byTypeCurrent: CountByName[]
  byTypePrevious: CountByName[]
  byObjectCurrent: CountByName[]
  byObjectPrevious: CountByName[]
}) {
  const pieBlock = (rows: CountByName[]) =>
    rows.length > 0 ? (
      <div className="summaryPdfComparePlot--pie">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows}
              dataKey="count"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={90}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            >
              {rows.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid #334155', color: 'var(--text)', borderRadius: 5 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    ) : (
      <p style={{ color: 'var(--text-muted)', margin: 0, minHeight: 120 }}>No data in this window.</p>
    )

  const barBlock = (rows: CountByName[]) =>
    rows.length > 0 ? (
      <div className="summaryPdfComparePlot--bar">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 56 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="name"
              stroke="#94A3B8"
              fontSize={11}
              interval={0}
              tick={({ x, y, payload }) => (
                <Text
                  x={x}
                  y={y}
                  angle={-45}
                  textAnchor="end"
                  verticalAnchor="start"
                  fill="#94A3B8"
                  fontSize={11}
                  dx={-8}
                  dy={4}
                >
                  {String(payload.value ?? '')}
                </Text>
              )}
            />
            <YAxis stroke="#94A3B8" fontSize={11} />
            <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid #334155', color: 'var(--text)', borderRadius: 5 }} />
            <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    ) : (
      <p style={{ color: 'var(--text-muted)', margin: 0, minHeight: 120 }}>No data in this window.</p>
    )

  return (
    <div>
      <section className="summaryPdfCompareBlock">
        <h2 style={{ marginTop: 0 }}>Violations by type</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 0, marginBottom: '0.75rem' }}>
          {`Compares the last ${hours} hours to the prior ${hours} hours.`}
        </p>
        <div className="summaryPdfCompareStack">
          <div className="summaryPdfCompareChartGroup">
            <h3 className="summaryPdfCompareChartHeading">{`Current window (last ${hours} hours)`}</h3>
            {pieBlock(byTypeCurrent)}
          </div>
          <div className="summaryPdfCompareChartGroup">
            <h3 className="summaryPdfCompareChartHeading">{`Previous window (prior ${hours} hours)`}</h3>
            {pieBlock(byTypePrevious)}
          </div>
        </div>
      </section>
      <section className="summaryPdfCompareBlock">
        <h2>Violations by object type</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 0, marginBottom: '0.75rem' }}>
          {`Compares the last ${hours} hours to the prior ${hours} hours.`}
        </p>
        <div className="summaryPdfCompareStack">
          <div className="summaryPdfCompareChartGroup">
            <h3 className="summaryPdfCompareChartHeading">{`Current window (last ${hours} hours)`}</h3>
            {barBlock(byObjectCurrent)}
          </div>
          <div className="summaryPdfCompareChartGroup">
            <h3 className="summaryPdfCompareChartHeading">{`Previous window (prior ${hours} hours)`}</h3>
            {barBlock(byObjectPrevious)}
          </div>
        </div>
      </section>
    </div>
  )
}

function SummaryTrendSection({ title, subtitle, data }: { title: string; subtitle?: string; data: TrendPoint[] }) {
  return (
    <section className="summaryTrendSection">
      <h2 style={{ marginBottom: subtitle ? '0.25rem' : '0.5rem' }}>{title}</h2>
      {subtitle ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 0, marginBottom: '0.75rem' }}>{subtitle}</p>
      ) : null}
      {data.length > 0 ? (
        <div className="summaryTrendPlot" style={{ height: 300, marginBottom: '2rem' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="period" stroke="#94A3B8" fontSize={12} />
              <YAxis stroke="#94A3B8" fontSize={12} />
              <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid #334155' }} />
              <Legend />
              <Line type="monotone" dataKey="generated" name="Generated" stroke="#00D4FF" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="failed" name="Failed" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="completed" name="Completed" stroke="#2797a3" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>No trend data in this window.</p>
      )}
    </section>
  )
}

const SUMMARY_LATEST_COLUMNS: DataTableColumn<Record<string, unknown>>[] = [
  { id: 'event_time', header: 'Event time', thClassName: 'dataTable__th--muted', tdClassName: 'dataTable__td--compact' },
  { id: 'violation_type', header: 'Type', thClassName: 'dataTable__th--muted', tdClassName: 'dataTable__td--compact' },
  { id: 'object_type', header: 'Object type', thClassName: 'dataTable__th--muted', tdClassName: 'dataTable__td--compact' },
  { id: 'object_name', header: 'Object', thClassName: 'dataTable__th--muted', tdClassName: 'dataTable__td--compact' },
  { id: 'user_email', header: 'User', thClassName: 'dataTable__th--muted', tdClassName: 'dataTable__td--compact' },
  {
    id: 'processing_status',
    header: 'Status',
    thClassName: 'dataTable__th--muted',
    tdClassName: 'dataTable__td--compact dataTable__td--status',
    cell: (row) => <StatusPill raw={String(row.processing_status ?? '')} />,
  },
  { id: 'action_type', header: 'Action type', thClassName: 'dataTable__th--muted', tdClassName: 'dataTable__td--compact' },
]

export default function Summary() {
  const [hours, setHours] = useState(24)
  const [remediationType, setRemediationType] = useState('ALL')
  const [data, setData] = useState<SummaryResponse | null>(null)
  const [trendData, setTrendData] = useState<TrendPoint[]>([])
  const [trendPreviousData, setTrendPreviousData] = useState<TrendPoint[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const summaryExportTopRef = useRef<HTMLDivElement>(null)
  const summaryPdfPreviousTrendRef = useRef<HTMLDivElement>(null)
  const summaryPdfBreakdownRef = useRef<HTMLDivElement>(null)
  const summaryPdfBrandRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      getSummary(hours, remediationType),
      getSummaryTrend(hours, remediationType, 'current'),
      getSummaryTrend(hours, remediationType, 'previous'),
    ])
      .then(([summary, trendCurrent, trendPrevious]) => {
        setData(summary)
        setTrendData(trendCurrent.trend || [])
        setTrendPreviousData(trendPrevious.trend || [])
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [hours, remediationType])

  async function handleExportPdf() {
    if (!data) return
    setPdfError(null)
    setExportingPdf(true)
    try {
      const { buildSummaryPdf } = await import('../utils/summaryPdf')
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      await new Promise((r) => setTimeout(r, 500))
      const top = summaryExportTopRef.current
      const prev = summaryPdfPreviousTrendRef.current
      const breakdown = summaryPdfBreakdownRef.current
      if (!top || !prev || !breakdown) throw new Error('Could not find summary content to export')
      await buildSummaryPdf({
        filenameHours: hours,
        brandEl: summaryPdfBrandRef.current,
        segments: [top, prev, breakdown],
      })
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : 'PDF export failed')
    } finally {
      setExportingPdf(false)
    }
  }

  if (loading && !data) return <LoadingIndicator size={36} color="white" />
  if (error) return <div style={{ color: '#f87171' }}>Error: {error}</div>
  if (!data) return null

  return (
    <>
      <div className="summary__filters">
        {loading ? <LoadingIndicator size={24} color="white" /> : null}
        <div className="summary__filtersRow">
          <label>Last</label>
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))} style={{ width: 100 }}>
            {HOURS_OPTIONS.map((h) => (
              <option key={h} value={h}>{h} hours</option>
            ))}
          </select>
        </div>
        <div className="summary__filtersRow">
          <label>Remediation type</label>
          <select value={remediationType} onChange={(e) => setRemediationType(e.target.value)} style={{ width: 100 }}>
            {REMEDIATION_TYPES.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
        <div className="summary__filtersExport">
          <ButtonWithIcon
            variant="outline-teal"
            type="button"
            disabled={exportingPdf || loading}
            onClick={() => void handleExportPdf()}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            }
          >
            {exportingPdf ? 'Exporting…' : 'Export PDF'}
          </ButtonWithIcon>
        </div>
        {pdfError ? <p className="summary__filtersExportError">{pdfError}</p> : null}
      </div>
      <div ref={summaryPdfBrandRef} className="summaryPdfBrandMount" aria-hidden>
        <GovernBotBrandMark />
      </div>
      <div className="summaryExportCapture">
        <div ref={summaryExportTopRef}>
          <h1 style={{ marginTop: 0 }}>Summary</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
            {`Violation summary for the last ${hours} hours (percent change compares to the prior ${hours}h window). Set catalog, schema, and warehouse path in Configs.`}
          </p>
          <div className="summaryStatsGrid">
            <div className="summaryStatCard">
              <div className="summaryStatCard__label">Total violations</div>
              <div className="summaryStatCard__value summaryStatCard__value--primary">{data.total}</div>
              <SummaryStatDelta pct={data.pct_change_total} hours={hours} />
            </div>
            <div className="summaryStatCard">
              <div className="summaryStatCard__label">Pending</div>
              <div className="summaryStatCard__value">{data.pending}</div>
              <SummaryStatDelta pct={data.pct_change_pending} hours={hours} />
            </div>
            <div className="summaryStatCard">
              <div className="summaryStatCard__label">Completed</div>
              <div className="summaryStatCard__value">{data.completed}</div>
              <SummaryStatDelta pct={data.pct_change_completed} hours={hours} />
            </div>
          </div>
          <SummaryTrendSection
            title="Violations over time"
            subtitle={`Current window: last ${hours} hours`}
            data={trendData}
          />
        </div>
        <div ref={summaryPdfPreviousTrendRef} className="summaryPdfPreviousTrendMount" aria-hidden>
          <SummaryTrendSection
            title="Violations over time — previous window"
            subtitle={`Prior ${hours} hours (for comparison with the current window above)`}
            data={trendPreviousData}
          />
        </div>
        <div ref={summaryPdfBreakdownRef} className="summaryPdfBreakdownsMount" aria-hidden>
          <SummaryPdfBreakdownCompare
            hours={hours}
            byTypeCurrent={data.by_type}
            byTypePrevious={data.by_type_previous ?? []}
            byObjectCurrent={data.by_object_type}
            byObjectPrevious={data.by_object_type_previous ?? []}
          />
        </div>
        <div>
          <h2 style={{ marginBottom: '0.5rem' }}>Recent Run Violations</h2>
          <div className="summaryChartsRow">
            <section className="summaryChartCell">
              <h3 style={{ marginBottom: '0.5rem' }}>Violations by type</h3>
              {data.by_type.length > 0 ? (
                <div className="summaryChartPlot summaryChartPlot--pie">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.by_type}
                        dataKey="count"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {data.by_type.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid #334155', color: 'var(--text)', borderRadius: 5 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', margin: 0 }}>No violations in the selected period.</p>
              )}
            </section>
            {data.by_object_type.length > 0 ? (
              <section className="summaryChartCell">
                <h3 style={{ marginBottom: '0.5rem' }}>Violations by object type</h3>
                <div className="summaryChartPlot summaryChartPlot--bar">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.by_object_type} margin={{ top: 8, right: 8, left: 8, bottom: 56 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis
                        dataKey="name"
                        stroke="#94A3B8"
                        fontSize={12}
                        interval={0}
                        tick={({ x, y, payload }) => (
                          <Text
                            x={x}
                            y={y}
                            angle={-45}
                            textAnchor="end"
                            verticalAnchor="start"
                            fill="#94A3B8"
                            fontSize={12}
                            dx={-8}
                            dy={4}
                          >
                            {String(payload.value ?? '')}
                          </Text>
                        )}
                      />
                      <YAxis stroke="#94A3B8" fontSize={12} />
                      <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid #334155', color: 'var(--text)', borderRadius: 5 }} />
                      <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            ) : null}
          </div>
        </div>
        <div className="summaryLatestSection">
          <h3 style={{ marginBottom: '0.5rem' }}>Latest violations</h3>
          {data.latest.length > 0 ? (
            <DataTable<Record<string, unknown>>
              rows={data.latest.slice(0, 20) as Record<string, unknown>[]}
              columns={SUMMARY_LATEST_COLUMNS}
              rowKey={(_, i) => `latest-${i}`}
            />
          ) : (
            <p style={{ color: 'var(--text-muted)' }}>No rows to show.</p>
          )}
        </div>
      </div>
    </>
  )
}
