import type { ReactNode } from 'react'

interface Props {
  title?: ReactNode
  extra?: ReactNode
  children: ReactNode
  bodyStyle?: React.CSSProperties
  style?: React.CSSProperties
}

export default function SectionCard({ title, extra, children, bodyStyle, style }: Props) {
  return (
    <section style={{ ...styles.card, ...style }}>
      {(title || extra) && (
        <header style={styles.header}>
          {title && <div style={styles.title}>{title}</div>}
          {extra && <div style={styles.extra}>{extra}</div>}
        </header>
      )}
      <div style={{ ...styles.body, ...bodyStyle }}>{children}</div>
    </section>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: 'var(--color-background-soft)',
    border: '0.5px solid var(--color-border)',
    borderRadius: 10,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '10px 14px',
    borderBottom: '0.5px solid var(--color-border-soft)',
  },
  title: { fontSize: 13, fontWeight: 600, color: 'var(--color-text-1)' },
  extra:  { display: 'flex', alignItems: 'center', gap: 8 },
  body:  { padding: 14 },
}
