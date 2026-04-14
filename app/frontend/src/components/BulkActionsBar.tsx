import { ButtonWithIcon } from './ButtonWithIcon'
import './BulkActionsBar.css'

function IconApprove() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconBulkNote() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 18V6a1 1 0 011-1h12a1 1 0 011 1v10l-4 3v-3H6a1 1 0 01-1-1z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M10 9h4M10 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="17" cy="7" r="4" fill="#0f1729" stroke="currentColor" strokeWidth="1.2" />
      <path d="M17 5.2v3.6M15.2 7h3.6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}

function IconClose() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export type BulkActionsBarProps = {
  selectedCount: number
  bulkNoteSet: boolean
  submitting: boolean
  onAcknowledge: () => void
  onAddNote: () => void
  onDismiss: () => void
}

export function BulkActionsBar({
  selectedCount,
  bulkNoteSet,
  submitting,
  onAcknowledge,
  onAddNote,
  onDismiss,
}: BulkActionsBarProps) {
  return (
    <div className="bulkActionsBar">
      <div className="bulkActionsBar__selection">
        <span className="bulkActionsBar__badge">{selectedCount}</span>
        <span className="bulkActionsBar__label">ITEMS SELECTED</span>
      </div>
      <div className="bulkActionsBar__sep" />
      <ButtonWithIcon variant="outline-teal" icon={<IconApprove />} disabled={submitting} onClick={onAcknowledge}>
        ACKNOWLEDGE SELECTED
      </ButtonWithIcon>
      <ButtonWithIcon variant="flat-dark" icon={<IconBulkNote />} onClick={onAddNote}>
        ADD BULK NOTE
        {bulkNoteSet ? ' ✓' : ''}
      </ButtonWithIcon>
      <ButtonWithIcon variant="icon-dismiss" icon={<IconClose />} onClick={onDismiss} aria-label="Clear selection" />
    </div>
  )
}
