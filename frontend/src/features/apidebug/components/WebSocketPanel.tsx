import { useState } from 'react'
import { Button, Input, Tag } from 'antd'
import { useWebSocket, type WSMessage } from '../hooks/useWebSocket'

interface Props {
  url: string
}

export default function WebSocketPanel({ url }: Props) {
  const { connected, messages, connect, disconnect, send, clearMessages } = useWebSocket()
  const [msgText, setMsgText] = useState('')

  const handleConnect = () => {
    if (connected) {
      disconnect()
    } else if (url) {
      connect(url)
    }
  }

  const handleSend = () => {
    if (msgText.trim()) {
      send(msgText.trim())
      setMsgText('')
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <Button size="small" type={connected ? 'default' : 'primary'} onClick={handleConnect} disabled={!url}>
          {connected ? '断开' : '连接'}
        </Button>
        <Tag color={connected ? 'success' : 'default'}>{connected ? '已连接' : '未连接'}</Tag>
        <Button size="small" onClick={clearMessages} style={{ marginLeft: 'auto' }}>清空</Button>
      </div>

      <div style={styles.msgList}>
        {messages.length === 0 && (
          <div style={styles.empty}>连接后消息将显示在此处</div>
        )}
        {messages.map((m) => (
          <div key={m.id} style={{ ...styles.msg, justifyContent: m.direction === 'sent' ? 'flex-end' : 'flex-start' }}>
            <div style={{ ...styles.bubble, background: m.direction === 'sent' ? 'var(--color-primary)' : 'var(--color-bg-2)', color: m.direction === 'sent' ? '#fff' : 'var(--color-text-1)' }}>
              <pre style={styles.msgPre}>{m.content}</pre>
              <div style={styles.msgMeta}>{new Date(m.timestamp).toLocaleTimeString()} | {m.size}B</div>
            </div>
          </div>
        ))}
      </div>

      <div style={styles.inputRow}>
        <Input.TextArea
          value={msgText}
          onChange={(e) => setMsgText(e.target.value)}
          placeholder="输入消息..."
          rows={2}
          style={{ flex: 1 }}
          onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); handleSend() } }}
        />
        <Button type="primary" onClick={handleSend} disabled={!connected || !msgText.trim()}>发送</Button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', gap: 8, padding: 8 },
  toolbar: { display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 },
  msgList: { flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6, padding: 8, background: 'var(--color-bg-1)', borderRadius: 4 },
  empty: { color: 'var(--color-text-3)', textAlign: 'center', marginTop: 40, fontSize: 13 },
  msg: { display: 'flex' },
  bubble: { maxWidth: '80%', borderRadius: 8, padding: '6px 10px' },
  msgPre: { margin: 0, fontSize: 12, fontFamily: 'var(--code-font-family)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' },
  msgMeta: { fontSize: 10, opacity: 0.6, marginTop: 4, textAlign: 'right' as any },
  inputRow: { display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 },
}
