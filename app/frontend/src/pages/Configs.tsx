import { useState, useEffect } from 'react'
import { getConfig, getWorkspaces, getIdentities, getFilters, updateWorkspace } from '../api'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { LoadingIndicator } from '../components/LoadingIndicator'
import { workspacePayloadFromRow, type WorkspaceRow, type IdentityRow, type FilterRow } from './configsFormUtils'
import { WorkspaceDialog, IdentityDialog, FilterDialog } from './ConfigsDialogs'
import './Configs.css'

function formatIdentityType(t: string): string {
  return t.replace(/_/g, ' ')
}

const ICON_GLOBE = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
)
const ICON_NETWORK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
    <circle cx="12" cy="5" r="2.5" />
    <circle cx="5" cy="19" r="2.5" />
    <circle cx="19" cy="19" r="2.5" />
    <path d="M12 7.5v3M7.5 17l3-4M16.5 17l-3-4" />
  </svg>
)
const ICON_FINGERPRINT = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
    <path d="M8.10008 21.221C6.71021 19.2375 5.89258 16.8243 5.89258 14.2187C5.89258 10.8443 8.6265 8.10938 11.9989 8.10938C15.3712 8.10938 18.1051 10.8443 18.1051 14.2187" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8.10008 21.221C6.71021 19.2375 5.89258 16.8243 5.89258 14.2187C5.89258 10.8443 8.6265 8.10938 11.9989 8.10938C15.3712 8.10938 18.1051 10.8443 18.1051 14.2187" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M18.4359 20.3118C18.3259 20.3179 18.218 20.3281 18.107 20.3281C14.7347 20.3281 12.0007 17.5931 12.0007 14.2188" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M18.4361 20.3118C18.3262 20.3179 18.2182 20.3281 18.1073 20.3281C14.7349 20.3281 12.001 17.5931 12.001 14.2188" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M13.2694 21.9999C10.675 20.382 8.94705 17.5024 8.94705 14.2187C8.94705 12.5315 10.3145 11.164 12.0007 11.164C13.6869 11.164 15.0543 12.5315 15.0543 14.2187C15.0543 15.9059 16.4218 17.2733 18.108 17.2733C19.7942 17.2733 21.1616 15.9059 21.1616 14.2187C21.1616 9.1571 17.0602 5.05469 12.0017 5.05469C6.94319 5.05469 2.8418 9.1571 2.8418 14.2187C2.8418 15.3469 2.96806 16.4455 3.20021 17.5045" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M13.2694 21.9999C10.675 20.382 8.94705 17.5024 8.94705 14.2187C8.94705 12.5315 10.3145 11.164 12.0007 11.164C13.6869 11.164 15.0543 12.5315 15.0543 14.2187C15.0543 15.9059 16.4218 17.2733 18.108 17.2733C19.7942 17.2733 21.1616 15.9059 21.1616 14.2187C21.1616 9.1571 17.0602 5.05469 12.0017 5.05469C6.94319 5.05469 2.8418 9.1571 2.8418 14.2187C2.8418 15.3469 2.96806 16.4455 3.20021 17.5045" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M20.5257 5.86313C18.4435 3.4978 15.399 2 12.0002 2C8.60136 2 5.55687 3.4978 3.47461 5.86313" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M20.5257 5.86313C18.4435 3.4978 15.399 2 12.0002 2C8.60136 2 5.55687 3.4978 3.47461 5.86313" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
)
const ICON_FILTER = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </svg>
)
const ICON_PLUS = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
    <path d="M12 5v14M5 12h14" />
  </svg>
)
/** Person + plus (matches “authorize identity” control in mock) */
const ICON_USER_PLUS = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M19 8v6M22 11h-6" />
  </svg>
)
const ICON_COPY = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)

export default function Configs() {
  const [config, setConfig] = useState({ catalog: '', schema: '', warehouse_http_path: '' })
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([])
  const [identities, setIdentities] = useState<IdentityRow[]>([])
  const [filters, setFilters] = useState<FilterRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [wsDialog, setWsDialog] = useState<{ open: boolean; mode: 'add' | 'edit'; row?: WorkspaceRow }>({ open: false, mode: 'add' })
  const [idDialog, setIdDialog] = useState<{ open: boolean; mode: 'add' | 'edit'; row?: IdentityRow }>({ open: false, mode: 'add' })
  const [filterDialog, setFilterDialog] = useState<{ open: boolean; mode: 'add' | 'edit'; row?: FilterRow }>({ open: false, mode: 'add' })

  const loadAll = () => {
    setLoading(true)
    setError(null)
    getConfig()
      .then((c) => {
        setConfig({
          catalog: localStorage.getItem('governbot_catalog') || c.catalog || '',
          schema: localStorage.getItem('governbot_schema') || c.schema || '',
          warehouse_http_path: localStorage.getItem('governbot_warehouse_http_path') || c.warehouse_http_path || '',
        })
        return Promise.all([getWorkspaces(), getIdentities(), getFilters()])
      })
      .then(([ws, id, fl]) => {
        setWorkspaces(ws.rows || [])
        setIdentities(id.rows || [])
        setFilters(fl.rows || [])
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  const saveConfig = () => {
    if (config.catalog) localStorage.setItem('governbot_catalog', config.catalog)
    if (config.schema) localStorage.setItem('governbot_schema', config.schema)
    if (config.warehouse_http_path) localStorage.setItem('governbot_warehouse_http_path', config.warehouse_http_path)
    loadAll()
  }

  const copyWarehousePath = () => {
    const v = config.warehouse_http_path
    if (!v) return
    void navigator.clipboard.writeText(v).catch(() => {})
  }

  useEffect(() => {
    getConfig()
      .then((c) => {
        setConfig({
          catalog: localStorage.getItem('governbot_catalog') || c.catalog || '',
          schema: localStorage.getItem('governbot_schema') || c.schema || '',
          warehouse_http_path: localStorage.getItem('governbot_warehouse_http_path') || c.warehouse_http_path || '',
        })
        return loadAll()
      })
      .catch(() => setLoading(false))
  }, [])

  const workspaceColumns: DataTableColumn<WorkspaceRow>[] = [
    {
      id: 'workspace_id',
      header: 'Workspace ID',
      thClassName: 'configs__th',
      tdClassName: 'configs__cellAccent',
    },
    {
      id: 'workspace_name',
      header: 'Workspace name',
      thClassName: 'configs__th',
      tdClassName: 'configs__cellStrong',
    },
    {
      id: 'workspace_url',
      header: 'Deployment URL',
      thClassName: 'configs__th',
      tdClassName: 'configs__cellMuted',
    },
    {
      id: 'enforcement_enabled',
      header: 'Enforcement',
      thClassName: 'configs__th',
      cell: (row) => (
        <span className="configs__interactiveCell" onClick={(e) => e.stopPropagation()} role="presentation">
          <label className="configs__toggle">
            <input
              type="checkbox"
              checked={Boolean(row.enforcement_enabled)}
              onChange={(e) => {
                const wid = String(row.workspace_id ?? '')
                if (!wid) return
                updateWorkspace(wid, workspacePayloadFromRow(row, { enforcement_enabled: e.target.checked }))
                  .then(loadAll)
                  .catch((err) => setError(err.message))
              }}
            />
            <span className="configs__toggleTrack">
              <span className="configs__toggleKnob" />
            </span>
          </label>
        </span>
      ),
    },
    {
      id: 'max_retry_attempts',
      header: 'Retries',
      thClassName: 'configs__th',
      cell: (row) => String(Number(row.max_retry_attempts) || 0),
    },
  ]

  const identityColumns: DataTableColumn<IdentityRow>[] = [
    {
      id: 'identity_name',
      header: 'Identity name',
      thClassName: 'configs__th',
      cell: (row) => {
        const name = String(row.identity_name ?? '')
        const sub = String(row.display_name ?? '')
        return (
          <div>
            <span className="configs__identityName">{name}</span>
            {sub ? <span className="configs__identitySub">{sub}</span> : null}
          </div>
        )
      },
    },
    {
      id: 'identity_type',
      header: 'Type',
      thClassName: 'configs__th',
      cell: (row) => <span className="configs__pill">{formatIdentityType(String(row.identity_type ?? ''))}</span>,
    },
    {
      id: 'is_active',
      header: 'Status',
      thClassName: 'configs__th',
      cell: (row) => {
        const active = Boolean(row.is_active)
        return (
          <span className={`configs__status${active ? '' : ' configs__status--inactive'}`}>
            <span className="configs__statusDot" aria-hidden />
            {active ? 'Active' : 'Inactive'}
          </span>
        )
      },
    },
  ]

  const filterColumns: DataTableColumn<FilterRow>[] = [
    {
      id: 'filter_name',
      header: 'Filter name',
      thClassName: 'configs__th',
      tdClassName: 'configs__cellAccent',
    },
    {
      id: 'service_name',
      header: 'Service name',
      thClassName: 'configs__th',
      tdClassName: 'configs__cellMuted',
    },
    {
      id: 'violation_type',
      header: 'Violation type',
      thClassName: 'configs__th',
      tdClassName: 'configs__cellViolation',
      cell: (row) => String(row.violation_type ?? '').toUpperCase(),
    },
  ]

  if (loading && !workspaces.length && !identities.length && !filters.length) {
    return <LoadingIndicator size={36} color="white" />
  }

  return (
    <div className="configs">
      <h1 style={{ marginTop: 0 }}>Configurations</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Catalog, schema, and warehouse path are sent with every API request. Add and edit workspaces, approved identities, and assets to track below.
      </p>
      {error ? <div className="configs__error">{error}</div> : null}
      {loading ? <div className="configs__loading"><LoadingIndicator size={24} color="white" /></div> : null}
      <section className="configs__card">
        <div className="configs__cardHeader">
          <div className="configs__cardTitleRow">
            <div className="configs__cardIcon">{ICON_GLOBE}</div>
            <div>
              <h2 className="configs__cardTitle">Global Directives</h2>
              <p className="configs__cardSubtitle">Core parameters</p>
            </div>
          </div>
          <button type="button" className="configs__btnPrimary" onClick={saveConfig}>
            Save and reload
          </button>
        </div>
        <div className="configs__grid2">
          <div className="configs__field">
            <label className="configs__label" htmlFor="cfg-catalog">
              Governance catalog
            </label>
            <input
              id="cfg-catalog"
              className="configs__input"
              value={config.catalog}
              onChange={(e) => setConfig((c) => ({ ...c, catalog: e.target.value }))}
              placeholder="e.g. main_governance_v4"
            />
          </div>
          <div className="configs__field">
            <label className="configs__label" htmlFor="cfg-schema">
              Governance schema
            </label>
            <input
              id="cfg-schema"
              className="configs__input"
              value={config.schema}
              onChange={(e) => setConfig((c) => ({ ...c, schema: e.target.value }))}
              placeholder="e.g. iso_certified_audit"
            />
          </div>
          <div className="configs__field configs__grid2FullRow">
            <label className="configs__label" htmlFor="cfg-warehouse">
              Warehouse HTTP path
            </label>
            <div className="configs__inputWrap">
              <input
                id="cfg-warehouse"
                className="configs__input configs__input--accent"
                value={config.warehouse_http_path}
                onChange={(e) => setConfig((c) => ({ ...c, warehouse_http_path: e.target.value }))}
                placeholder="/sql/1.0/warehouses/..."
                autoComplete="off"
              />
              <button
                type="button"
                className="configs__copyBtn"
                title="Copy path"
                aria-label="Copy warehouse path"
                onClick={copyWarehousePath}
              >
                {ICON_COPY}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="configs__card">
        <div className="configs__cardHeader">
          <div className="configs__cardTitleRow">
            <div className="configs__cardIcon">{ICON_NETWORK}</div>
            <div>
              <h2 className="configs__cardTitle">Workspaces tracking</h2>
              <p className="configs__cardSubtitle">Table: governance_config_workspaces</p>
            </div>
          </div>
          <button type="button" className="configs__btnPrimary" onClick={() => setWsDialog({ open: true, mode: 'add' })}>
            <span className="configs__btnIcon">{ICON_PLUS}</span>
            Add workspace
          </button>
        </div>
        {workspaces.length === 0 ? (
          <p className="configs__empty">No workspaces. Add one or configure catalog/schema above and save.</p>
        ) : (
          <div className="configs__tableScrollCap">
            <DataTable<WorkspaceRow>
              rows={workspaces}
              columns={workspaceColumns}
              rowKey={(row, i) => String(row.workspace_id ?? i)}
              onRowClick={(row) => setWsDialog({ open: true, mode: 'edit', row })}
            />
          </div>
        )}
      </section>

      <div className="configs__bottomGrid">
        <section className="configs__card">
          <div className="configs__cardHeader">
            <div className="configs__cardTitleRow">
              <div className="configs__cardIcon">{ICON_FINGERPRINT}</div>
              <div>
                <h2 className="configs__cardTitle">Approved identities</h2>
                <p className="configs__cardSubtitle">Table: governance_preapproved_identities</p>
              </div>
            </div>
            <button type="button" className="configs__btnPrimary" onClick={() => setIdDialog({ open: true, mode: 'add' })}>
              <span className="configs__btnIcon">{ICON_USER_PLUS}</span>
              Authorize identity
            </button>
          </div>
          {identities.length === 0 ? (
            <p className="configs__empty">No identities.</p>
          ) : (
            <div className="configs__tableScrollCap">
              <DataTable<IdentityRow>
                rows={identities}
                columns={identityColumns}
                rowKey={(row, i) => `${String(row.identity_name ?? '')}-${String(row.identity_type ?? '')}-${i}`}
                onRowClick={(row) => setIdDialog({ open: true, mode: 'edit', row })}
              />
            </div>
          )}
        </section>

        <section className="configs__card">
          <div className="configs__cardHeader">
            <div className="configs__cardTitleRow">
              <div className="configs__cardIcon">{ICON_FILTER}</div>
              <div>
                <h2 className="configs__cardTitle">Asset filters</h2>
                <p className="configs__cardSubtitle">Table: governance_filters</p>
              </div>
            </div>
            <button type="button" className="configs__btnPrimary" onClick={() => setFilterDialog({ open: true, mode: 'add' })}>
              <span className="configs__btnIcon">{ICON_PLUS}</span>
              Add filter
            </button>
          </div>
          {filters.length === 0 ? (
            <p className="configs__empty">No filters.</p>
          ) : (
            <div className="configs__tableScrollCap">
              <DataTable<FilterRow>
                rows={filters}
                columns={filterColumns}
                rowKey={(row, i) => `${String(row.filter_id ?? row.filter_name ?? i)}-${i}`}
                onRowClick={(row) => setFilterDialog({ open: true, mode: 'edit', row })}
              />
            </div>
          )}
        </section>
      </div>

      {wsDialog.open ? (
        <WorkspaceDialog
          mode={wsDialog.mode}
          row={wsDialog.row}
          onClose={() => setWsDialog({ open: false, mode: 'add' })}
          onSaved={() => {
            setWsDialog({ open: false, mode: 'add' })
            loadAll()
          }}
          onError={setError}
        />
      ) : null}
      {idDialog.open ? (
        <IdentityDialog
          mode={idDialog.mode}
          row={idDialog.row}
          onClose={() => setIdDialog({ open: false, mode: 'add' })}
          onSaved={() => {
            setIdDialog({ open: false, mode: 'add' })
            loadAll()
          }}
          onError={setError}
        />
      ) : null}
      {filterDialog.open ? (
        <FilterDialog
          mode={filterDialog.mode}
          row={filterDialog.row}
          onClose={() => setFilterDialog({ open: false, mode: 'add' })}
          onSaved={() => {
            setFilterDialog({ open: false, mode: 'add' })
            loadAll()
          }}
          onError={setError}
        />
      ) : null}
    </div>
  )
}
