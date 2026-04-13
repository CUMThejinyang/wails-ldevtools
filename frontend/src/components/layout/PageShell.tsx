import type { ReactNode } from 'react'

interface Props {
  title: ReactNode
  actions?: ReactNode
  children: ReactNode
}

export default function PageShell({ title, actions, children }: Props) {
  return (
    <div style={styles.root}>
      <header style={styles.header}>
        <h1 style={styles.title}>{title}</h1>
        {actions && <div style={styles.actions}>{actions}</div>}
      </header>
      {children}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    height: '100%',
    minHeight: 0,
    backgroundColor: 'var(--color-background)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    height: 'var(--navbar-height)',
    minHeight: 'var(--navbar-height)',
    padding: '0 16px',
    borderBottom: '0.5px solid var(--color-border)',
    backgroundColor: 'var(--navbar-bg)',
    flexShrink: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--color-text-1)',
    margin: 0,
    display: 'inline-flex',
    alignItems: 'center',
  },
  actions: { display: 'flex', alignItems: 'center', gap: 8 },
}
