import { useCallback, useEffect, useMemo, useState } from 'react'
import { CloudServerOutlined, EyeOutlined, FolderOpenOutlined, ProfileOutlined } from '@ant-design/icons'
import { Button, Tag, message, Tabs } from 'antd'
import PageShell from '@/components/layout/PageShell'
import SectionCard from '@/components/layout/SectionCard'
import { bridge } from '@/services/bridge'
import { useWailsEvent } from '@/hooks/useWailsEvent'
import type { LocalServerConfig, LogEntry, ServerStatus } from '@/types'
import ControlPanel from './components/ControlPanel'
import AddressList from './components/AddressList'
import LogTable from './components/LogTable'
import StatusBadge from './components/StatusBadge'
import FileExplorer from './components/FileExplorer'
import FTPConfigPanel from './components/FTPConfigPanel'
import SFTPConfigPanel from './components/SFTPConfigPanel'

const defaultConfig: LocalServerConfig = {
  root: '',
  port: 5800,
  bindLocal: false,
  spaMode: false,
  singleFile: false,
  indexName: 'index.html',
  authEnabled: false,
  authUser: '',
  authPass: '',
}

export default function LocalServerPage() {
  const [config, setConfig] = useState<LocalServerConfig>(defaultConfig)
  const [status, setStatus] = useState<ServerStatus>({ running: false } as ServerStatus)
  const [error, setError] = useState<string>('')
  const [logs, setLogs] = useState<LogEntry[]>([])

  useEffect(() => {
    bridge.getLocalServerConfig().then((c) => {
      setConfig({ ...defaultConfig, ...c })
    }).catch(() => {})
  }, [])

  useEffect(() => {
    bridge.getServerStatus().then(setStatus).catch(() => {})
    bridge.getServerLogs(200).then((entries) => {
      if (entries && entries.length > 0) setLogs(entries)
    }).catch(() => {})
  }, [])

  useWailsEvent<{ running: boolean }>('server:status', (data) => {
    if (data && !data.running) {
      setStatus({ running: false } as ServerStatus)
    }
  })

  useWailsEvent<LogEntry>('server:log', (entry) => {
    setLogs((prev) => [...prev.slice(-199), entry])
  })

  useWailsEvent<{ entries: LogEntry[] }>('server:log_batch', (data) => {
    if (data?.entries) {
      setLogs((prev) => [...prev.slice(-(200 - data.entries.length)), ...data.entries])
    }
  })

  const handleStart = useCallback(async () => {
    setError('')
    try {
      await bridge.startServer(config)
      const s = await bridge.getServerStatus()
      setStatus(s)
      if (!s.bindLocal && s.urls && s.urls.length <= 1) {
        message.warning('未检测到可用局域网地址，如需 LAN 访问请检查网络连接')
      } else {
        const lanCount = (s.urls?.length ?? 1) - 1
        message.success(lanCount > 0 ? `已启动，局域网 ${lanCount} 个地址可访问` : '已启动，仅本机可访问')
      }
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : err?.message || '启动失败'
      setError(msg)
      message.error(msg)
    }
  }, [config])

  const handleStop = useCallback(async () => {
    try {
      await bridge.stopServer()
      setStatus({ running: false } as ServerStatus)
      message.success('服务已停止')
    } catch (err: any) {
      message.error(typeof err === 'string' ? err : err?.message || '停止失败')
    }
  }, [])

  const handleSaveConfig = useCallback(async () => {
    try {
      await bridge.saveLocalServerConfig(config)
      message.success('配置已保存')
    } catch {
      message.error('保存配置失败')
    }
  }, [config])

  const handleClearLogs = useCallback(() => {
    setLogs([])
  }, [])

  const updateConfig = useCallback((patch: Partial<LocalServerConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }))
  }, [])

  const visitorUrl = useMemo(() => {
    if (!status.running || !status.urls || status.urls.length === 0) return ''
    return status.bindLocal ? status.urls[0] : status.urls.find((url) => !url.includes('127.0.0.1')) || status.urls[0]
  }, [status])

  const activeTab = useMemo(() => {
    const hash = window.location.hash
    if (hash === '#ftp') return 'ftp'
    if (hash === '#sftp') return 'sftp'
    return 'http'
  }, [])

  const [tabKey, setTabKey] = useState(activeTab)

  const handleTabChange = useCallback((key: string) => {
    setTabKey(key)
    window.location.hash = key
  }, [])

  const httpContent = (
    <div style={styles.httpBody}>
      <div style={styles.topRow}>
        <SectionCard title="本地管理端" style={{ flex: 1 }}>
          <ControlPanel
            config={config}
            onChange={updateConfig}
            running={status.running}
            error={error}
            onStart={handleStart}
            onStop={handleStop}
            onSave={handleSaveConfig}
          />
        </SectionCard>
        <SectionCard title="访问地址" style={{ width: 380 }}>
          <AddressList status={status} />
        </SectionCard>
      </div>

      <SectionCard title="局域网访问者页面" style={{ flexShrink: 0 }}>
        <div style={styles.visitorCard}>
          <div style={styles.visitorMain}>
            <div style={styles.visitorTitleRow}>
              <EyeOutlined style={{ color: 'var(--color-primary)' }} />
              <span style={styles.visitorTitle}>面向访客的独立文件浏览页</span>
              <Tag color={status.running ? 'success' : 'default'}>{status.running ? '已发布' : '未启动'}</Tag>
            </div>
            <div style={styles.visitorDesc}>
              访客页只展示可访问文件、目录浏览与下载入口，不暴露请求日志、配置开关或管理操作。
            </div>
            <div style={styles.visitorMetaRow}>
              <div style={styles.metaItem}>
                <FolderOpenOutlined style={{ color: 'var(--color-text-3)' }} />
                <span>{config.singleFile ? '单文件直链下载' : '目录浏览 + 多选打包下载'}</span>
              </div>
              <div style={styles.metaItem}>
                <ProfileOutlined style={{ color: 'var(--color-text-3)' }} />
                <span>{status.authEnabled ? '受基础认证保护' : '未启用认证'}</span>
              </div>
            </div>
          </div>
          <div style={styles.visitorActions}>
            <div style={styles.visitorUrl} title={visitorUrl || '服务未启动'}>
              {visitorUrl || '启动后显示访客访问地址'}
            </div>
            <Button
              type="primary"
              disabled={!visitorUrl}
              onClick={() => window.open(visitorUrl, '_blank')}
            >
              打开访客页
            </Button>
          </div>
        </div>
      </SectionCard>

      <div style={styles.bottomRow}>
        <SectionCard
          title="共享文件（本地管理端）"
          extra={status.running ? <span style={styles.cardHint}>仅用于本机预览与检查</span> : undefined}
          fill
          style={{ minWidth: 0, flex: 1.1 }}
          bodyStyle={{ flex: 1, minHeight: 0, padding: 8, overflow: 'auto' }}
        >
          <FileExplorer status={status} />
        </SectionCard>
        <SectionCard
          title="请求日志（本地管理端）"
          extra={logs.length > 0 ? <span style={{ color: 'var(--color-text-3)', fontSize: 12 }}>{logs.length} 条</span> : undefined}
          fill
          style={{ minWidth: 0, flex: 1 }}
          bodyStyle={{ flex: 1, minHeight: 0, padding: 0, overflow: 'auto' }}
        >
          <LogTable logs={logs} onClear={handleClearLogs} />
        </SectionCard>
      </div>
    </div>
  )

  const ftpContent = (
    <div style={styles.tabBody}>
      <SectionCard title="FTP 服务配置">
        <FTPConfigPanel />
      </SectionCard>
    </div>
  )

  const sftpContent = (
    <div style={styles.tabBody}>
      <SectionCard title="SFTP 服务配置">
        <SFTPConfigPanel />
      </SectionCard>
    </div>
  )

  return (
    <PageShell
      title={<><CloudServerOutlined style={{ color: 'var(--color-primary)', marginRight: 8 }} />本地服务</>}
      actions={<StatusBadge running={status.running} error={error} />}
    >
      <Tabs
        className="localserver-tabs"
        activeKey={tabKey}
        onChange={handleTabChange}
        items={[
          { key: 'http', label: 'HTTP 服务', children: httpContent },
          { key: 'ftp', label: 'FTP 服务', children: ftpContent },
          { key: 'sftp', label: 'SFTP 服务', children: sftpContent },
        ]}
      />
    </PageShell>
  )
}

const styles: Record<string, React.CSSProperties> = {
  httpBody: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    gap: 12,
    padding: 12,
    overflow: 'hidden',
  },
  tabBody: {
    padding: 12,
    height: '100%',
    overflow: 'auto',
  },
  topRow: {
    display: 'flex',
    gap: 12,
    flexShrink: 0,
    minWidth: 0,
  },
  bottomRow: {
    display: 'flex',
    gap: 12,
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  visitorCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  visitorMain: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    minWidth: 0,
    flex: 1,
  },
  visitorTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  visitorTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--color-text-1)',
  },
  visitorDesc: {
    fontSize: 12,
    color: 'var(--color-text-2)',
    lineHeight: 1.6,
  },
  visitorMetaRow: {
    display: 'flex',
    gap: 16,
    flexWrap: 'wrap',
  },
  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    color: 'var(--color-text-2)',
    fontSize: 12,
  },
  visitorActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    alignItems: 'flex-end',
    flexShrink: 0,
    minWidth: 0,
  },
  visitorUrl: {
    maxWidth: 320,
    color: 'var(--color-text-3)',
    fontSize: 12,
    fontFamily: 'var(--code-font-family)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  cardHint: {
    color: 'var(--color-text-3)',
    fontSize: 12,
  },
}
