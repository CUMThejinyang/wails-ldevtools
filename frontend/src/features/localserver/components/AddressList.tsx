import { CopyOutlined, GlobalOutlined, QrcodeOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Tag, Tooltip } from 'antd'
import { useMessage } from '@/hooks/useMessage'
import type { ServerStatus } from '@/types'
import QrPopover from './QrPopover'

interface Props {
  status: ServerStatus
}

export default function AddressList({ status }: Props) {
  const message = useMessage()
  if (!status.running) {
    return (
      <div style={styles.empty}>
        <GlobalOutlined style={{ fontSize: 28, color: 'var(--color-text-3)', marginBottom: 8 }} />
        <span style={{ color: 'var(--color-text-3)', fontSize: 13 }}>服务未启动</span>
      </div>
    )
  }

  const urls = status.urls ?? []
  const lanCount = urls.length - 1

  return (
    <div style={styles.container}>
      <div style={styles.tags}>
        {status.bindLocal ? (
          <Tag color="success">仅本机 (127.0.0.1)</Tag>
        ) : (
          <Tag color="warning">局域网可访问</Tag>
        )}
        {status.authEnabled && <Tag color="blue">已启用基础认证</Tag>}
      </div>

      {urls.map((url) => (
        <div key={url} style={styles.addressRow}>
          <span style={styles.urlText} title={url}>{url}</span>
          <div style={styles.actions}>
            <Tooltip title="复制">
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                onClick={() => {
                  navigator.clipboard.writeText(url)
                  message.success('已复制')
                }}
              />
            </Tooltip>
            <QrPopover url={url}>
              <Button type="text" size="small" icon={<QrcodeOutlined />} />
            </QrPopover>
            <Tooltip title="在浏览器打开">
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => window.open(url, '_blank')}
              />
            </Tooltip>
          </div>
        </div>
      ))}

      {!status.bindLocal && lanCount === 0 && (
        <div style={styles.tip}>
          未检测到可用局域网地址，如需 LAN 访问请检查网络连接
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: 8 },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0' },
  tags: { display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 },
  addressRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 8px',
    borderRadius: 6,
    backgroundColor: 'var(--color-background-mute)',
  },
  urlText: { fontSize: 12, color: 'var(--color-text-1)', fontFamily: 'var(--code-font-family)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 },
  actions: { display: 'flex', gap: 0, flexShrink: 0 },
  tip: { color: 'var(--color-text-3)', fontSize: 11, marginTop: 4 },
}
