// frontend/src/features/apidebug/components/UrlBar.tsx
import { Select, Input, Button } from 'antd'
import { SendOutlined, SaveOutlined } from '@ant-design/icons'
import type { ApiMethod } from '@/types'

const METHOD_COLORS: Record<string, string> = {
  GET: '#61affe', POST: '#49cc90', PUT: '#fca130',
  DELETE: '#f93e3e', PATCH: '#50e3c2', HEAD: '#9012fe', OPTIONS: '#0d5aa7',
}

interface UrlBarProps {
  method: ApiMethod
  url: string
  envNames: string[]
  activeEnvId: string | null
  onMethodChange: (m: ApiMethod) => void
  onUrlChange: (url: string) => void
  onEnvChange: (id: string | null) => void
  onSend: () => void
  onSave: () => void
  loading: boolean
}

export default function UrlBar({ method, url, envNames, activeEnvId, onMethodChange, onUrlChange, onEnvChange, onSend, onSave, loading }: UrlBarProps) {
  return (
    <div style={styles.container}>
      <Select
        value={method}
        onChange={onMethodChange}
        size="small"
        style={{ width: 100 }}
        options={['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].map((m) => ({
          value: m,
          label: <span style={{ color: METHOD_COLORS[m], fontWeight: 600 }}>{m}</span>,
        }))}
      />
      <Input
        size="small"
        value={url}
        onChange={(e) => onUrlChange(e.target.value)}
        placeholder="https://api.example.com/endpoint"
        style={{ flex: 1, fontFamily: 'var(--code-font-family)' }}
        onPressEnter={onSend}
      />
      <Select
        value={activeEnvId || undefined}
        onChange={(v) => onEnvChange(v || null)}
        size="small"
        style={{ width: 110 }}
        placeholder="无环境"
        allowClear
        options={envNames.map((name) => ({ value: name, label: name }))}
      />
      <Button type="primary" size="small" icon={<SendOutlined />} onClick={onSend} loading={loading}>
        发送
      </Button>
      <Button size="small" icon={<SaveOutlined />} onClick={onSave}>
        保存
      </Button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0' },
}
