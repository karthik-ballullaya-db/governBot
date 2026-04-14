import { useMemo, useState } from 'react'

type ObjectTypesMultiSelectProps = {
  id: string
  label: string
  options: string[]
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  required?: boolean
}

function sortedUnique(a: string[]): string[] {
  return [...new Set(a)].sort((x, y) => x.localeCompare(y))
}

/**
 * Collapsible multi-select for discovery object types (checkbox list + search).
 */
export function ObjectTypesMultiSelect({
  id,
  label,
  options,
  value,
  onChange,
  disabled,
  required,
}: ObjectTypesMultiSelectProps) {
  const [query, setQuery] = useState('')
  const displayOptions = useMemo(() => {
    const base = sortedUnique(options)
    const extras = value.filter((v) => !base.includes(v))
    return extras.length ? sortedUnique([...base, ...extras]) : base
  }, [options, value])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return displayOptions
    return displayOptions.filter((o) => o.toLowerCase().includes(q))
  }, [displayOptions, query])

  const toggle = (o: string) => {
    if (disabled) return
    if (value.includes(o)) onChange(value.filter((x) => x !== o))
    else onChange(sortedUnique([...value, o]))
  }

  const selectAllFiltered = () => {
    if (disabled) return
    onChange(sortedUnique([...value, ...filtered]))
  }

  const clearAll = () => {
    if (disabled) return
    onChange([])
  }

  const summary =
    value.length === 0
      ? required
        ? 'Select object types…'
        : 'None selected'
      : `${value.length} type${value.length === 1 ? '' : 's'} selected`

  return (
    <div className="configs__formRow">
      <label className="configs__formLabel" htmlFor={`${id}-search`}>
        {label}
        {required ? ' *' : ''}
      </label>
      <details className="configs__multiDetails">
        <summary className="configs__multiSummary">{summary}</summary>
        <div className="configs__multiBody">
          <input
            id={`${id}-search`}
            type="search"
            className="configs__formInput configs__multiSearch"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search types…"
            disabled={disabled}
            autoComplete="off"
          />
          <div className="configs__multiToolbar">
            <button type="button" className="configs__multiLinkBtn" onClick={selectAllFiltered} disabled={disabled || filtered.length === 0}>
              Add all visible
            </button>
            <button type="button" className="configs__multiLinkBtn" onClick={clearAll} disabled={disabled || value.length === 0}>
              Clear
            </button>
          </div>
          <div className="configs__multiList" role="group" aria-label={label}>
            {filtered.map((o) => (
              <label key={o} className="configs__multiRow">
                <input
                  type="checkbox"
                  className="configs__formCheckbox"
                  checked={value.includes(o)}
                  onChange={() => toggle(o)}
                  disabled={disabled}
                />
                <span className="configs__multiRowLabel">{o}</span>
              </label>
            ))}
            {filtered.length === 0 ? <span className="configs__multiEmpty">No matches</span> : null}
          </div>
        </div>
      </details>
    </div>
  )
}
