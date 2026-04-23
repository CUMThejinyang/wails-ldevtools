import { useCallback, useEffect, useState } from 'react'
import { Button, Input, InputNumber, Switch, message, Space, Typography } from 'antd'
import { CopyOutlined, FolderOpenOutlined, PlayCircleOutlined, StopOutlined, SaveOutlined } from '@ant-design/icons'
import { bridge } from '@/services/bridge'
import { useWailsEvent } from '@/hooks/useWailsEvent'
import type { SFTPConfig, SFTPStatus } from '@/types'
import StatusBadge from './StatusBadge'

const defaultConfig: SFTPConfig = {
  root: '',
  port: 22,
  bindLocal: true,
  authUser: '',
  authPass: '',
}

interface Props {
  onStatusChange?: (running: boolean) => void
}

export default function SFTPConfigPanel({ onStatusChange }: Props) {
  const [config, setConfig] = useState<SFTPConfig>(defaultConfig)
  const [status, setStatus] = useState<SFTPStatus>({ running: false } as SFTPStatus)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    bridge.getSftpConfig().then((c) => {
      setConfig({ ...defaultConfig, ...c })
    }).catch(() => {})
  }, [])

  useEffect(() => {
    bridge.getSFTPStatus().then(setStatus).catch(() => {})
  }, [])

  useWailsEvent<{ running: boolean }>('server:sftp_status', (data) => {
    if (data && !data.running) {
      setStatus({ running: false } as SFTPStatus)
    } else if (data) {
      bridge.getSFTPStatus().then(setStatus).catch(() => {})
    }
  })

  const updateConfig = useCallback((patch: Partial<SFTPConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }))
  }, [])

  const handleSelectDir = useCallback(async () => {
    const dir = await bridge.selectDirectory()
    if (dir) {
      updateConfig({ root: dir })
    }
  }, [updateConfig])

  const handleStart = useCallback(async () => {
    setError('')
    try {
      await bridge.startSFTP(config)
      const s = await bridge.getSFTPStatus()
      setStatus(s)
      message.success('SFTP服务已启动')
      onStatusChange?.(true)
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : err?.message || '启动失败'
      setError(msg)
      message.error(msg)
    }
  }, [config, onStatusChange])

  const handleStop = useCallback(async () => {
    try {
      await bridge.stopSFTP()
      setStatus({ running: false } as SFTPStatus)
      message.success('SFTP服务已停止')
      onStatusChange?.(false)
    } catch (err: any) {
      message.error(typeof err === 'string' ? err : err?.message || '停止失败')
    }
  }, [onStatusChange])

  const handleSave = useCallback(async () => {
    try {
      await bridge.saveSftpConfig(config)
      message.success('配置已保存')
    } catch {
      message.error('保存配置失败')
    }
  }, [config])

  const handleOpenUrl = useCallback(() => {
    if (status.urls && status.urls.length > 0) {
      window.open(status.urls[0], '_blank')
    }
  }, [status.urls])

  return (
    <div style={styles.container}>
      <div style={styles.row}>
        <span style={styles.label}>根目录</span>
        <Input
          style={{ flex: 1 }}
          value={config.root}
          placeholder="选择或粘贴文件夹路径"
          onChange={(e) => updateConfig({ root: e.target.value })}
        />
        <Button icon={<FolderOpenOutlined />} onClick={handleSelectDir} style={{ marginLeft: 8 }}>
          浏览
        </Button>
      </div>

      <div style={styles.row}>
        <span style={styles.label}>端口</span>
        <InputNumber
          value={config.port || 22}
          onChange={(v) => updateConfig({ port: v ?? 22 })}
          min={1}
          max={65535}
          style={{ width: 120 }}
        />
        <span style={{ marginLeft: 16, color: 'var(--color-text-2)' }}>默认 22</span>
      </div>

      <div style={styles.row}>
        <span style={styles.label}>绑定本地</span>
        <Switch checked={config.bindLocal} onChange={(checked) => updateConfig({ bindLocal: checked })} />
        <span style={{ marginLeft: 8, color: 'var(--color-text-2)' }}>仅 127.0.0.1 可访问</span>
      </div>

      <div style={styles.row}>
        <span style={styles.label}>认证用户</span>
        <Space>
          <Input
            placeholder="用户名"
            value={config.authUser}
            onChange={(e) => updateConfig({ authUser: e.target.value })}
            style={{ width: 140 }}
          />
          <Input.Password
            placeholder="密码"
            value={config.authPass}
            onChange={(e) => updateConfig({ authPass: e.target.value })}
            style={{ width: 140 }}
          />
        </Space>
      </div>

      <div style={styles.actions}>
        <Button icon={<SaveOutlined />} onClick={handleSave}>
          保存配置
        </Button>
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          disabled={status.running}
          onClick={handleStart}
          style={{ marginLeft: 8 }}
        >
          启动
        </Button>
        <Button
          danger
          icon={<StopOutlined />}
          disabled={!status.running}
          onClick={handleStop}
          style={{ marginLeft: 8 }}
        >
          停止
        </Button>
        {status.running && status.urls && status.urls.length > 0 && (
          <Button style={{ marginLeft: 8 }} onClick={handleOpenUrl}>
            连接 SFTP
          </Button>
        )}
      </div>

      {error && (
        <div style={{ color: 'var(--color-error)', marginTop: 8 }}>{error}</div>
      )}

      {status.running && (
        <div style={styles.statusPanel}>
          <div style={styles.statusRow}>
            <StatusBadge running={status.running} />
            <span style={{ marginLeft: 12 }}>活跃连接 {status.activeConns}</span>
          </div>
          <div style={{ marginTop: 8, color: 'var(--color-text-2)', fontSize: 12 }}>
            启动于 {status.startedAt ? new Date(status.startedAt).toLocaleTimeString() : '-'}
          </div>
          <div style={{ marginTop: 8 }}>
            <span style={styles.label}>访问地址</span>
            <div style={{ marginTop: 4 }}>
              {status.urls?.map((url, i) => (
                <Typography.Text
                  key={i}
                  copyable={{ text: url, tooltips: ['复制', '已复制'] }}
                  style={{ fontFamily: 'var(--code-font-family)', fontSize: 12, color: 'var(--color-text-2)', display: 'block', marginBottom: 2 }}
                >
                  {url}
                </Typography.Text>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    width: 70,
    color: 'var(--color-text-2)',
    fontSize: 13,
    flexShrink: 0,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    marginTop: 8,
  },
  statusPanel: {
    marginTop: 16,
    padding: 12,
    background: 'var(--color-bg-2)',
    borderRadius: 6,
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
  },
}