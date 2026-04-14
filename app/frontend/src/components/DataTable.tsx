import type { ReactNode } from 'react'
import './DataTable.css'

export type DataTableColumn<T> = {
  id: string
  header: ReactNode
  thClassName?: string
  tdClassName?: string
  cell?: (row: T) => ReactNode
}

export type DataTableLeadingColumn<T> = {
  header: ReactNode
  thClassName?: string
  cell: (row: T, rowIndex: number) => ReactNode
}

export type DataTableProps<T> = {
  rows: T[]
  columns: DataTableColumn<T>[]
  rowKey: (row: T, rowIndex: number) => string
  leadingColumn?: DataTableLeadingColumn<T>
  /** When set, rows show pointer cursor and invoke this on click (use stopPropagation on interactive cells). */
  onRowClick?: (row: T, rowIndex: number) => void
}

function defaultCell(row: Record<string, unknown>, columnId: string): ReactNode {
  return String(row[columnId] ?? '')
}

export function DataTable<T extends Record<string, unknown>>({
  rows,
  columns,
  rowKey,
  leadingColumn,
  onRowClick,
}: DataTableProps<T>) {
  return (
    <div className="dataTable__wrap">
      <table className="dataTable">
        <thead>
          <tr className="dataTable__theadRow">
            {leadingColumn && (
              <th className={`dataTable__th ${leadingColumn.thClassName ?? ''}`.trim()}>{leadingColumn.header}</th>
            )}
            {columns.map((col) => (
              <th key={col.id} className={`dataTable__th ${col.thClassName ?? ''}`.trim()}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="dataTable__tbody">
          {rows.map((row, rowIndex) => (
            <tr
              key={rowKey(row, rowIndex)}
              className={`dataTable__row${onRowClick ? ' dataTable__row--clickable' : ''}`.trim()}
              onClick={onRowClick ? () => onRowClick(row, rowIndex) : undefined}
            >
              {leadingColumn && (
                <td className="dataTable__td">{leadingColumn.cell(row, rowIndex)}</td>
              )}
              {columns.map((col) => (
                <td key={col.id} className={`dataTable__td ${col.tdClassName ?? ''}`.trim()}>
                  {col.cell ? col.cell(row) : defaultCell(row as Record<string, unknown>, col.id)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
