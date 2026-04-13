import type { ReactNode } from 'react'

interface Props {
  label: ReactNode
  value: ReactNode
  highlight?: boolean
}

export default function StatRow({ label, value, highlight }: Props) {
  return (
    <div style={styles.row}>
      <span style={styles.label}>{label}</span>
      <span style={{ ...styles.value, ...(highlight ? styles.highlight : null) }}>{value}</span>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '6px 0', gap: 12, borderBottom: '0.5px solid var(--color-border-soft)',
  },
  label: { color: 'var(--color-text-2)', fontSize: 13 },
  value: { color: 'var(--color-text-1)', fontSize: 13, fontVariantNumeric: 'tabular-nums' },
  highlight: { color: 'var(--color-primary)', fontWeight: 600 },
}
