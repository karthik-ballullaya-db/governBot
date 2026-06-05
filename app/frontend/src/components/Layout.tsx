import { ReactNode, useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { getMe, type MeResponse } from '../api'
import './Layout.css'

const iconStyle = { width: 20, height: 20, flexShrink: 0 }

function IconSummary() {
  return (
    <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  )
}
function IconActions() {
  return (
    <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  )
}
function IconGenie() {
  return (
    <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}
function IconConfigs() {
  return (
    <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function NavItem({
  to,
  matchPaths,
  icon,
  label,
}: {
  to: string
  matchPaths: string[]
  icon: React.ReactNode
  label: string
}) {
  const location = useLocation()
  const isActive = matchPaths.some((p) => location.pathname === p || (p !== '/' && location.pathname.startsWith(p)))
  return (
    <NavLink
      to={to}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '1rem 0.75rem',
        color: isActive ? 'var(--primary)' : 'var(--text)',
        background: isActive ? '#061424' : 'transparent',
        borderRight: isActive ? '3px solid var(--primary)' : '3px solid transparent',
        borderRadius: 3,
        textDecoration: 'none',
      }}
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  )
}

function firstNameInitial(me: MeResponse): string {
  const g = me.given_name?.trim()
  if (g && g.length > 0) return g[0].toUpperCase()
  const n = me.name?.trim()
  if (n) {
    const first = n.split(/\s+/)[0]
    if (first.length > 0) return first[0].toUpperCase()
  }
  const e = me.email?.trim()
  if (e) {
    const local = e.split('@')[0]
    if (local.length > 0) return local[0].toUpperCase()
  }
  return '?'
}

function UserNavFooter({ me }: { me: MeResponse | null }) {
  const label = me?.name?.trim() || me?.email?.trim() || 'Not signed in'
  const sub = me?.email?.trim() && me?.name?.trim() ? me.email : null
  const initial = me ? firstNameInitial(me) : '?'
  return (
    <div
      style={{
        marginTop: 'auto',
        flexShrink: 0,
        paddingTop: '1rem',
        borderTop: '1px solid #334155',
        display: 'flex',
        alignItems: 'center',
        gap: '0.65rem',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'var(--primary)',
          color: 'var(--bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1rem',
          fontWeight: 700,
          flexShrink: 0,
        }}
        aria-hidden
      >
        {initial}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </div>
        {sub ? (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sub}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null)

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => setMe(null))
  }, [])

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside className="layout__aside">
        <h2 className="layout__brand">🛡️ GovernBot</h2>
        <nav className="layout__navScroll" aria-label="Main navigation">
          <NavItem to="/summary" matchPaths={['/', '/summary']} icon={<IconSummary />} label="Summary" />
          <NavItem to="/actions" matchPaths={['/actions']} icon={<IconActions />} label="Actions Center" />
          <NavItem to="/genie" matchPaths={['/genie']} icon={<IconGenie />} label="Genie Space" />
          <NavItem to="/configs" matchPaths={['/configs']} icon={<IconConfigs />} label="Configs" />
        </nav>
        <UserNavFooter me={me} />
      </aside>
      <main className="layout__main">{children}</main>
    </div>
  )
}
