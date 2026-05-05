import { useState, useMemo } from 'react'
import Editor from '@monaco-editor/react'
import { Tabs, Tag, Input } from 'antd'
import type { ResponseSnapshot, ApiCookieEntry } from '@/types'
import { formatBytes } from '@/services/bridge'

interface ResponsePanelProps {
  response: ResponseSnapshot | null
  loading: boolean
  error: string | null
}

function isDarkMode() {
  return document.body.getAttribute('theme-mode') !== 'light'
}

export default function ResponsePanel({ response, loading, error }: ResponsePanelProps) {
  const [searchText, setSearchText] = useState('')
  const [bodyView, setBodyView] = useState<'formatted' | 'raw'>('formatted')
  const dark = isDarkMode()

  const formattedBody = useMemo(() => {
    if (!response?.body) return '(空响应体)'
    try {
      const parsed = JSON.parse(response.body)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return response.body
    }
  }, [response?.body])

  const filteredBody = useMemo(() => {
    if (!searchText) return formattedBody
    return formattedBody.split('\n').filter(l => l.toLowerCase().includes(searchText.toLowerCase())).join('\n') || '(无匹配行)'
  }, [formattedBody, searchText])

  const cookieEntries = useMemo(() => {
    const entries: ApiCookieEntry[] = []
    const setCookie = (response?.headers?.['set-cookie']) || ''
    if (setCookie) {
      const parts = setCookie.split(';')
      const nameValue = parts[0].split('=')
      entries.push({
        name: nameValue[0] || '',
        value: nameValue.slice(1).join('=') || '',
        domain: response?.headers?.['host'] || '',
        path: '/',
        httpOnly: setCookie.toLowerCase().includes('httponly'),
        secure: setCookie.toLowerCase().includes('secure'),
      })
    }
    return entries
  }, [response?.headers])

  if (loading) {
    return <div style={styles.placeholder}>发送请求中...</div>
  }
  if (error) {
    return <div style={{ ...styles.placeholder, color: '#f93e3e' }}>{error}</div>
  }
  if (!response) {
    return <div style={styles.placeholder}>输入 URL 并点击发送开始调试</div>
  }

  const statusColor = response.status < 300 ? 'success' : response.status < 500 ? 'warning' : 'error'
  const editorLanguage = bodyView === 'formatted' && looksLikeJson(response.body) ? 'json' : 'plaintext'

  return (
    <div style={styles.container}>
      <div style={styles.metaBar}>
        <Tag color={statusColor}>{response.status} {response.statusText}</Tag>
        <span style={styles.metaItem}>{formatBytes(response.size)}</span>
        <span style={styles.metaItem}>{response.durationMs}ms</span>
      </div>

      <Tabs
        size="small"
        items={[
          {
            key: 'body',
            label: 'Body',
            children: (
              <div>
                <div style={styles.toolbar}>
                  <span
                    style={{ ...styles.toolBtn, fontWeight: bodyView === 'formatted' ? 600 : 400, color: bodyView === 'formatted' ? 'var(--color-primary)' : 'var(--color-text-2)' }}
                    onClick={() => setBodyView('formatted')}
                  >美化</span>
                  <span style={{ color: 'var(--color-text-3)' }}>|</span>
                  <span
                    style={{ ...styles.toolBtn, fontWeight: bodyView === 'raw' ? 600 : 400, color: bodyView === 'raw' ? 'var(--color-primary)' : 'var(--color-text-2)' }}
                    onClick={() => setBodyView('raw')}
                  >原始</span>
                  <Input.Search
                    size="small"
                    placeholder="搜索..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    style={{ width: 180, marginLeft: 'auto' }}
                    allowClear
                  />
                </div>
                <div style={styles.editorWrap}>
                  <Editor
                    height="320px"
                    language={editorLanguage}
                    theme={dark ? 'vs-dark' : 'vs'}
                    value={bodyView === 'raw' ? response.body : filteredBody}
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      fontSize: 12,
                      wordWrap: 'on',
                      automaticLayout: true,
                      scrollBeyondLastLine: false,
                    }}
                  />
                </div>
              </div>
            ),
          },
          {
            key: 'headers',
            label: 'Headers',
            children: (
              <div style={styles.headersList}>
                {Object.entries(response.headers).map(([k, v]) => (
                  <div key={k} style={styles.headerRow}>
                    <span style={styles.headerKey}>{k}:</span>
                    <span style={styles.headerVal}>{v}</span>
                  </div>
                ))}
                {Object.keys(response.headers).length === 0 && <div style={{ color: 'var(--color-text-3)' }}>无响应头</div>}
              </div>
            ),
          },
          {
            key: 'cookies',
            label: 'Cookies',
            children: (
              <table style={styles.table}>
                <thead><tr>{['Name', 'Value', 'Domain', 'Path', 'HttpOnly', 'Secure'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {cookieEntries.length === 0 ? <tr><td colSpan={6} style={{ ...styles.td, color: 'var(--color-text-3)' }}>无 Cookie</td></tr> :
                    cookieEntries.map((c, i) => (
                      <tr key={i}>
                        <td style={styles.td}>{c.name}</td>
                        <td style={styles.td}>{c.value}</td>
                        <td style={styles.td}>{c.domain}</td>
                        <td style={styles.td}>{c.path}</td>
                        <td style={styles.td}>{c.httpOnly ? '✓' : '✗'}</td>
                        <td style={styles.td}>{c.secure ? '✓' : '✗'}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            ),
          },
        ]}
      />
    </div>
  )
}

function looksLikeJson(value: string) {
  try {
    JSON.parse(value)
    return true
  } catch {
    return false
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%' },
  placeholder: { padding: 40, textAlign: 'center', color: 'var(--color-text-3)', fontSize: 14 },
  metaBar: { display: 'flex', gap: 12, alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--color-border)', marginBottom: 4 },
  metaItem: { fontSize: 12, color: 'var(--color-text-2)', fontFamily: 'var(--code-font-family)' },
  toolbar: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 },
  toolBtn: { cursor: 'pointer', fontSize: 12, userSelect: 'none' },
  editorWrap: { border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden' },
  headersList: { display: 'flex', flexDirection: 'column', gap: 2 },
  headerRow: { display: 'flex', gap: 8, fontSize: 12, fontFamily: 'var(--code-font-family)', padding: '2px 0' },
  headerKey: { fontWeight: 600, color: 'var(--color-primary)', flexShrink: 0 },
  headerVal: { color: 'var(--color-text-1)', wordBreak: 'break-all' },
  table: { width: '100%', fontSize: 12, borderCollapse: 'collapse' as const },
  th: { textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-2)', fontWeight: 600 },
  td: { padding: '4px 8px', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-1)', fontFamily: 'var(--code-font-family)' },
}
