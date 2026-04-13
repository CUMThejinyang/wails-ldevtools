import { Progress, Tooltip } from 'antd'
import StatusTag, { type StatusKind } from './StatusTag'

interface Props {
  current: number
  total: number
  currentFile?: string
  status: StatusKind
  title?: React.ReactNode
  extra?: React.ReactNode
}

export default function ProgressPanel({
  current, total, currentFile, status, title, extra,
}: Props) {
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0

  return (
    <div style={styles.root}>
      <div style={styles.head}>
        <div style={styles.headLeft}>
          {title && <span style={styles.title}>{title}</span>}
          <StatusTag status={status} />
        </div>
        {extra && <div style={styles.extra}>{extra}</div>}
      </div>

      <Progress percent={percent} showInfo strokeColor="var(--color-primary)" />

      <div style={styles.meta}>
        <span style={styles.count}>{current} / {total}</span>
        {currentFile && (
          <Tooltip title={currentFile} placement="topLeft">
            <span className="text-nowrap" style={styles.file}>{currentFile}</span>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'var(--color-background-soft)',
    border: '0.5px solid var(--color-border)',
  },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  headLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  title: { fontSize: 13, fontWeight: 500, color: 'var(--color-text-1)' },
  extra: { display: 'flex', alignItems: 'center', gap: 8 },
  meta: {
    display: 'flex', alignItems: 'center', gap: 10,
    fontSize: 12, color: 'var(--color-text-2)',
  },
  count: { flexShrink: 0, color: 'var(--color-text-3)', fontVariantNumeric: 'tabular-nums' },
  file: { flex: 1, minWidth: 0 },
}
