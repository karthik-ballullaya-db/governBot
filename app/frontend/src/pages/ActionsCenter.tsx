import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { getActions, bulkAcknowledgeViolations, type ActionRow } from '../api'
import { StatusPill } from '../components/StatusPill'
import { Modal } from '../components/Modal'
import { BulkActionsBar } from '../components/BulkActionsBar'
import './ActionsCenter.css'
import { ButtonWithIcon } from '../components/ButtonWithIcon'
import { IconClearFilters } from '../components/icons/IconClearFilters'
import { LoadingIndicator } from '../components/LoadingIndicator'
import { DataTable, type DataTableColumn } from '../components/DataTable'

const PAGE_SIZE = 25

const ACTIONS_TABLE_COLUMNS: DataTableColumn<ActionRow>[] = [
  { id: 'event_time', header: 'Event time' },
  { id: 'workspace_id', header: 'Workspace' },
  { id: 'violation_type', header: 'Type' },
  { id: 'remediation_action', header: 'Remediation action' },
  {
    id: '_object',
    header: 'Object',
    cell: (row) => (
      <>
        {String(row.object_name ?? '')} ({String(row.object_type ?? '')})
      </>
    ),
  },
  { id: 'user_email', header: 'User' },
  {
    id: '_status',
    header: 'Status',
    tdClassName: 'dataTable__td--status',
    cell: (row) => <StatusPill raw={String(row.ca_status ?? row.processing_status ?? '')} />,
  },
]

export default function ActionsCenter() {
  const [rows, setRows] = useState<ActionRow[]>([])
  const [workspaces, setWorkspaces] = useState<string[]>(['(all)'])
  const [violationTypes, setViolationTypes] = useState<string[]>(['(all)'])
  const [remediationActions, setRemediationActions] = useState<string[]>(['(all)'])
  const [filterWorkspace, setFilterWorkspace] = useState('(all)')
  const [filterViolationType, setFilterViolationType] = useState('(all)')
  const [filterRemediation, setFilterRemediation] = useState('(all)')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [bulkNote, setBulkNote] = useState('')
  const [bulkNoteModal, setBulkNoteModal] = useState(false)
  const [bulkNoteDraft, setBulkNoteDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const headerCheckboxRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    getActions({
      workspace: filterWorkspace !== '(all)' ? filterWorkspace : undefined,
      violation_type: filterViolationType !== '(all)' ? filterViolationType : undefined,
      remediation_action: filterRemediation !== '(all)' ? filterRemediation : undefined,
    })
      .then((res) => {
        setRows(res.rows)
        const ws = [...new Set(res.rows.map((r) => String(r.workspace_id || '')))].filter(Boolean)
        setWorkspaces(['(all)', ...ws].filter((w, i, a) => a.indexOf(w) === i))
        const vt = [...new Set(res.rows.map((r) => String(r.violation_type || '')))].filter(Boolean)
        setViolationTypes(['(all)', ...vt].filter((v, i, a) => a.indexOf(v) === i))
        const ra = [...new Set(res.rows.map((r) => String(r.remediation_action || '')))].filter(Boolean)
        setRemediationActions(['(all)', ...ra].filter((r, i, a) => a.indexOf(r) === i))
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [filterWorkspace, filterViolationType, filterRemediation])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setPage(1)
    setSelectedIds(new Set())
    setBulkNote('')
    setBulkNoteDraft('')
    setBulkNoteModal(false)
  }, [filterWorkspace, filterViolationType, filterRemediation])

  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageRows = useMemo(
    () => rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [rows, safePage],
  )

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const pageIds = useMemo(() => pageRows.map((r) => String(r.violation_id ?? '')).filter(Boolean), [pageRows])
  const selectedOnPageCount = useMemo(() => pageIds.filter((id) => selectedIds.has(id)).length, [pageIds, selectedIds])
  const allPageSelected = pageIds.length > 0 && selectedOnPageCount === pageIds.length
  const somePageSelected = selectedOnPageCount > 0 && selectedOnPageCount < pageIds.length

  useEffect(() => {
    const el = headerCheckboxRef.current
    if (el) el.indeterminate = somePageSelected
  }, [somePageSelected])

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAllPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allPageSelected) {
        pageIds.forEach((id) => next.delete(id))
      } else {
        pageIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
    setBulkNote('')
  }

  const openBulkNoteModal = () => {
    setBulkNoteDraft(bulkNote)
    setBulkNoteModal(true)
  }

  const saveBulkNoteFromModal = () => {
    setBulkNote(bulkNoteDraft)
    setBulkNoteModal(false)
  }

  const handleBulkAcknowledge = async () => {
    if (selectedIds.size === 0) return
    setSubmitting(true)
    setError(null)
    try {
      await bulkAcknowledgeViolations(Array.from(selectedIds), bulkNote)
      clearSelection()
      load()
    } catch (e) {
      setError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const start = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1
  const end = Math.min(safePage * PAGE_SIZE, total)

  return (
    <>
      <h1 className="actionsCenter__title">Actions Center</h1>
      <div className="actionsCenter__badgeRow">
        <div className="actionsCenter__countBadge">
          {`${rows.length} pending violations` || 'No pending violations'}
        </div>
      </div>
      <div style={{ position: 'absolute', top: 20, right: 20, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
        {submitting || (loading && rows.length) ? <LoadingIndicator size={24} color="white" /> : null}
      </div>
      {error && <div className="actionsCenter__error">{error}</div>}
      <div className="actionsCenter__filters">
        <div>
          <label>WORKSPACE</label>
          <select
            className="actionsCenter__filterSelect"
            value={filterWorkspace}
            onChange={(e) => setFilterWorkspace(e.target.value)}
          >
            {workspaces.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>VIOLATION TYPE</label>
          <select
            className="actionsCenter__filterSelect"
            value={filterViolationType}
            onChange={(e) => setFilterViolationType(e.target.value)}
          >
            {violationTypes.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>REMEDIATION ACTION</label>
          <select
            className="actionsCenter__filterSelect"
            value={filterRemediation}
            onChange={(e) => setFilterRemediation(e.target.value)}
          >
            {remediationActions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="actionsCenter__clearFilters__container">
          <ButtonWithIcon
            variant="filter-clear"
            icon={<IconClearFilters />}
            onClick={() => {
              setFilterWorkspace('(all)')
              setFilterViolationType('(all)')
              setFilterRemediation('(all)')
            }}
          >
            Clear filters
          </ButtonWithIcon>
        </div>
      </div>
      {loading && !rows.length ? (
        <LoadingIndicator size={24} color="white" />
      ) : rows.length === 0 ? (
        <p className="actionsCenter__empty">No pending violations.</p>
      ) : (
        <>
          <div className="actionsCenter__dataBlock">
            <DataTable<ActionRow>
              rows={pageRows}
              columns={ACTIONS_TABLE_COLUMNS}
              rowKey={(row) => String(row.violation_id ?? '') || JSON.stringify(row)}
              leadingColumn={{
                header: (
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    className="dataTable__checkbox"
                    checked={allPageSelected}
                    onChange={toggleSelectAllPage}
                    aria-label="Select all rows on this page"
                  />
                ),
                thClassName: 'dataTable__th--checkbox',
                cell: (row) => {
                  const id = String(row.violation_id ?? '')
                  return (
                    <input
                      type="checkbox"
                      className="dataTable__checkbox"
                      checked={selectedIds.has(id)}
                      onChange={() => toggleRow(id)}
                      disabled={!id}
                      aria-label={`Select row ${id}`}
                    />
                  )
                },
              }}
            />
            <div className="actionsCenter__pagination">
              <span>
                SHOWING {start}-{end} OF {total} RESULTS
              </span>
              {totalPages > 1 && (
                <div className="actionsCenter__paginationControls">
                  <button
                    type="button"
                    className="secondary"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <span className="actionsCenter__pageLabel">
                    Page {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className="secondary"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {selectedIds.size > 0 && (
        <BulkActionsBar
          selectedCount={selectedIds.size}
          bulkNoteSet={Boolean(bulkNote.trim())}
          submitting={submitting}
          onAcknowledge={handleBulkAcknowledge}
          onAddNote={openBulkNoteModal}
          onDismiss={clearSelection}
        />
      )}

      <Modal open={bulkNoteModal}>
        <h3 className="modalTitle">Bulk note</h3>
        <p className="modalDescription">
          This text is saved with the next approve or reject action for all selected items.
        </p>
        <label>Note / reason</label>
        <textarea
          className="modalTextarea"
          value={bulkNoteDraft}
          onChange={(e) => setBulkNoteDraft(e.target.value)}
          rows={4}
        />
        <div className="modalActions">
          <button type="button" className="secondary" onClick={() => setBulkNoteModal(false)}>
            Cancel
          </button>
          <button type="button" onClick={saveBulkNoteFromModal}>
            Save note
          </button>
        </div>
      </Modal>
    </>
  )
}
