import { useEffect, type ReactNode } from 'react'
import './FormModal.css'

export type FormModalDeleteAction = {
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  label?: string
  loadingLabel?: string
}

export type FormModalProps = {
  open: boolean
  title: string
  /** Stable id for aria-labelledby (unique per dialog instance). */
  titleId: string
  onClose: () => void
  children: ReactNode
  /** Shown on the left when provided (typically edit mode). */
  deleteAction?: FormModalDeleteAction | null
  onCancel: () => void
  onPrimary: () => void
  primaryLabel: string
  primaryDisabled?: boolean
  primaryLoading?: boolean
  primaryLoadingLabel?: string
}

export function FormModal({
  open,
  title,
  titleId,
  onClose,
  children,
  deleteAction,
  onCancel,
  onPrimary,
  primaryLabel,
  primaryDisabled,
  primaryLoading,
  primaryLoadingLabel = 'Saving…',
}: FormModalProps) {
  useEffect(() => {
    if (!open) return
    const html = document.documentElement
    const body = document.body
    const prevHtmlOverflow = html.style.overflow
    const prevBodyOverflow = body.style.overflow
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    return () => {
      html.style.overflow = prevHtmlOverflow
      body.style.overflow = prevBodyOverflow
    }
  }, [open])

  if (!open) return null

  const del = deleteAction
  const deleteLabel = del?.loading ? (del.loadingLabel ?? 'Deleting…') : (del?.label ?? 'Delete entry')

  return (
    <div className="formModal">
      <div className="formModal__overlay" onClick={onClose} role="presentation">
        <div
          className="formModal__box"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <h3 id={titleId} className="formModal__title">
            {title}
          </h3>
          {children}
          <div className="formModal__footer">
            {del ? (
              <button
                type="button"
                className="formModal__btnDanger"
                onClick={del.onClick}
                disabled={del.disabled || del.loading || primaryLoading}
              >
                {deleteLabel}
              </button>
            ) : null}
            <span className="formModal__footerSpacer" aria-hidden />
            <button type="button" className="formModal__btnSecondary" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="formModal__btnPrimary"
              onClick={onPrimary}
              disabled={primaryDisabled || primaryLoading || del?.loading}
            >
              {primaryLoading ? primaryLoadingLabel : primaryLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
