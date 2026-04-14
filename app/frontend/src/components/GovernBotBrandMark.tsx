import './GovernBotBrandMark.css'

/** Inline SVG app mark for header / PDF (renders reliably in html2canvas). */
export function GovernBotAppIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`governBotAppIcon ${className}`.trim()}
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect width="40" height="40" rx="10" fill="#1E293B" stroke="#00D4FF" strokeWidth="1.5" />
      <path
        d="M12 22c0-4 3-7 8-7s8 3 8 7v3H12v-3z"
        fill="#0F172A"
        stroke="#00D4FF"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="2" fill="#00D4FF" />
      <circle cx="24" cy="16" r="2" fill="#00D4FF" />
      <path d="M14 26h12" stroke="#94A3B8" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}

export function GovernBotBrandMark() {
  return (
    <header className="governBotBrandMark">
      <GovernBotAppIcon />
      <div className="governBotBrandMark__text">
        <div className="governBotBrandMark__title">GovernBot</div>
        <div className="governBotBrandMark__sub">Powered by Databricks Apps</div>
      </div>
    </header>
  )
}
