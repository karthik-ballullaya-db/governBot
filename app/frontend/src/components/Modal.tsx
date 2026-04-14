import type { ReactNode } from 'react'
import './Modal.css'

type ModalProps = {
  open: boolean
  children: ReactNode
  className?: string
}

export function Modal({ open, children, className = '' }: ModalProps) {
  if (!open) return null
  return (
    <div className="modalBackdrop" role="presentation">
      <div className={`modalPanel ${className}`.trim()} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
