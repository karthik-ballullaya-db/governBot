import './StatusPill.css'

export type StatusCategory = 'PENDING' | 'SUCCESS' | 'FAILED' | 'SUCCESS_ACK' | 'SKIPPED'

export function statusCategory(raw: string): StatusCategory {
  const s = String(raw || '')
    .trim()
    .toUpperCase()
  if (s === 'SUCCESS' || s === 'COMPLETED') return 'SUCCESS'
  if (s === 'FAILED' || s.includes('FAIL')) return 'FAILED'
  if (s === 'SUCCESS_ACKNOWLEDGED') return 'SUCCESS_ACK'
  if (s === 'SKIPPED') return 'SKIPPED'
  return 'PENDING'
}

const categoryClass: Record<StatusCategory, string> = {
  PENDING: 'statusPill--pending',
  SUCCESS: 'statusPill--success',
  FAILED: 'statusPill--failed',
  SUCCESS_ACK: 'statusPill--success-ack',
  SKIPPED: 'statusPill--skipped',
}

export function StatusPill({ raw }: { raw: string }) {
  const key = statusCategory(raw)
  return <span className={`statusPill ${categoryClass[key]}`}>{key}</span>
}
