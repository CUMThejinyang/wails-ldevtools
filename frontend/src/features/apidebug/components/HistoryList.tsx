import type { HistoryEntry } from '@/types'

interface Props {
  history: HistoryEntry[]
  onSelect: (entry: HistoryEntry) => void
  onClear: () => void
}

export default function HistoryList({ history, onSelect, onClear }: Props) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>历史</span>
        {history.length > 0 && (
          <span onClick={onClear} style={styles.clearBtn}>清空</span>
        )}
      </div>
      <div style={styles.list}>
        {history.length === 0 ? (
          <div style={styles.empty}>暂无历史记录</div>
        ) : (
          history.map((h) => {
            const time = new Date(h.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
            const methodColor = { GET: '#61affe', POST: '#49cc90', PUT: '#fca130', DELETE: '#f93e3e', PATCH: '#50e3c2', HEAD: '#9012fe', OPTIONS: '#0d5aa7' }[h.request.method] || '#aaa'
            return (
              <div key={h.id} style={styles.item} onClick={() => onSelect(h)}>
                <span style={{ ...styles.method, color: methodColor }}>{h.request.method}</span>
                <span style={styles.url}>{h.request.url}</span>
                <span style={styles.status}>{h.response?.status || '---'}</span>
                <span style={styles.time}>{time}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '50%', overflow: 'hidden' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderBottom: '1px solid var(--color-border)' },
  title: { fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)' },
  clearBtn: { fontSize: 11, color: 'var(--color-text-3)', cursor: 'pointer' },
  list: { overflow: 'auto', flex: 1 },
  empty: { padding: 16, textAlign: 'center', color: 'var(--color-text-3)', fontSize: 12 },
  item: { display: 'flex', gap: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer', alignItems: 'center', whiteSpace: 'nowrap' as any },
  method: { fontWeight: 700, width: 40, flexShrink: 0, fontSize: 10 },
  url: { overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, color: 'var(--color-text-2)' },
  status: { width: 30, textAlign: 'right' as any, color: 'var(--color-text-3)' },
  time: { width: 40, textAlign: 'right' as any, color: 'var(--color-text-3)' },
}
