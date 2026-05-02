import { Tooltip } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'

interface HeaderSource {
  key: string
  value: string
  source: '请求级' | '环境' | '集合' | '全局'
}

interface Props {
  merged: HeaderSource[]
}

export default function HeaderPreview({ merged }: Props) {
  if (merged.length === 0) return null
  return (
    <div style={styles.container}>
      <div style={styles.title}>
        <InfoCircleOutlined style={{ fontSize: 12 }} />
        <span>合并后的请求头预览</span>
      </div>
      {merged.map((h, i) => (
        <div key={i} style={styles.row}>
          <span style={styles.key}>{h.key}:</span>
          <span style={styles.val}>{h.value}</span>
          <Tooltip title={`来源：${h.source}`}>
            <span style={styles.source}>{h.source}</span>
          </Tooltip>
        </div>
      ))}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { background: 'var(--color-bg-1)', borderRadius: 4, padding: '6px 8px', fontSize: 11, fontFamily: 'var(--code-font-family)' },
  title: { display: 'flex', gap: 4, alignItems: 'center', color: 'var(--color-text-3)', marginBottom: 4, fontSize: 11 },
  row: { display: 'flex', gap: 6, alignItems: 'center', padding: '1px 0' },
  key: { color: 'var(--color-primary)', fontWeight: 600 },
  val: { color: 'var(--color-text-2)', wordBreak: 'break-all', flex: 1 },
  source: { color: 'var(--color-text-3)', fontSize: 10, flexShrink: 0, background: 'var(--color-bg-2)', padding: '0 4px', borderRadius: 2 },
}
