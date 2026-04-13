import type { ReactNode } from 'react'

interface Props {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  style?: React.CSSProperties
}

export default function EmptyState({ icon, title, description, action, style }: Props) {
  return (
    <div style={{ ...styles.root, ...style }}>
      {icon && <div style={styles.icon}>{icon}</div>}
      <div style={styles.title}>{title}</div>
      {description && <div style={styles.desc}>{description}</div>}
      {action && <div style={styles.action}>{action}</div>}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: '48px 16px',
    color: 'var(--color-text-2)',
  },
  icon:  { color: 'var(--color-text-3)', fontSize: 40, lineHeight: 1 },
  title: { fontSize: 14, fontWeight: 500, color: 'var(--color-text-1)' },
  desc:  { fontSize: 12, color: 'var(--color-text-3)', textAlign: 'center', maxWidth: 420 },
  action:{ marginTop: 4 },
}
