import { useState, useEffect, useCallback } from 'react'
import { Input, Segmented, Select, Button, Tag, Modal, theme } from 'antd'
import { message } from '@/services/message'
import {
  ReloadOutlined,
  DeleteOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { bridge } from '@/services/bridge'
import type { PortEntry } from '@/types'

export interface ToolbarFilter {
  portKeyword: string
  pidKeyword: string
  processKeyword: string
  protocol: string
  family: string
  states: string[]
}

interface Props {
  loading: boolean
  data: PortEntry[]
  selectedPids: number[]
  pollingInterval: number
  filter: ToolbarFilter
  onPollingChange: (ms: number) => void
  onRefresh: () => void
  onFilterChange: (filter: ToolbarFilter) => void
  onKillDone: () => void
}

const TCP_STATES = [
  'LISTEN', 'ESTABLISHED', 'TIME_WAIT', 'CLOSE_WAIT',
  'SYN_SENT', 'SYN_RCVD', 'FIN_WAIT_1', 'FIN_WAIT_2',
  'CLOSING', 'LAST_ACK', 'CLOSED',
]

export default function Toolbar({
  loading,
  data,
  selectedPids,
  pollingInterval,
  filter,
  onPollingChange,
  onRefresh,
  onFilterChange,
  onKillDone,
}: Props) {
  const { token } = theme.useToken()
  const [elevated, setElevated] = useState(false)

  useEffect(() => {
    bridge.isPortElevated().then(setElevated).catch(() => {})
  }, [])

  const updateFilter = useCallback(<K extends keyof ToolbarFilter>(key: K, value: ToolbarFilter[K]) => {
    onFilterChange({ ...filter, [key]: value })
  }, [filter, onFilterChange])

  const handleBatchKill = useCallback(() => {
    if (selectedPids.length === 0) return
    const pidMap = new Map<number, string>()
    for (const e of data) {
      if (selectedPids.includes(e.pid) && !pidMap.has(e.pid)) {
        pidMap.set(e.pid, e.processName)
      }
    }
    const lines = selectedPids.map(pid => {
      const name = pidMap.get(pid) ?? 'unknown'
      return `${name} (PID ${pid})`
    })

    Modal.confirm({
      title: `确认结束 ${selectedPids.length} 个进程`,
      content: (
        <div>
          <p>即将结束以下进程：</p>
          <ul style={{ maxHeight: 200, overflow: 'auto', margin: 0, paddingLeft: 20 }}>
            {lines.map(l => <li key={l}>{l}</li>)}
          </ul>
        </div>
      ),
      okText: '结束',
      okButtonProps: {
        danger: true,
        style: {
          background: token.colorError,
          borderColor: token.colorError,
          color: '#ffffff',
        },
      },
      cancelText: '取消',
      cancelButtonProps: {
        style: {
          background: token.colorBgContainer,
          borderColor: token.colorBorder,
          color: token.colorText,
        },
      },
      centered: true,
      rootClassName: 'ports-kill-confirm',
      styles: {
        content: {
          background: token.colorBgElevated,
        },
        header: {
          background: token.colorBgElevated,
        },
        body: {
          background: token.colorBgElevated,
        },
        footer: {
          background: token.colorBgElevated,
        },
      },
      onOk: async () => {
        try {
          await bridge.killPortProcesses(selectedPids)
          message.success('已结束进程')
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          if (msg.includes('用户取消了权限请求')) {
            message.info('已取消权限请求')
          } else {
            message.error(msg)
          }
        }
        onKillDone()
      },
    })
  }, [selectedPids, data, onKillDone, token.colorBgContainer, token.colorBgElevated, token.colorBorder, token.colorError, token.colorText])

  return (
    <div style={styles.toolbar}>
      <div style={styles.left}>
        <Input
          placeholder="端口"
          value={filter.portKeyword}
          onChange={e => updateFilter('portKeyword', e.target.value)}
          allowClear
          style={{ width: 100 }}
          size="small"
        />
        <Input
          placeholder="PID"
          value={filter.pidKeyword}
          onChange={e => updateFilter('pidKeyword', e.target.value)}
          allowClear
          style={{ width: 100 }}
          size="small"
        />
        <Input
          placeholder="进程名"
          value={filter.processKeyword}
          onChange={e => updateFilter('processKeyword', e.target.value)}
          allowClear
          style={{ width: 180 }}
          size="small"
        />
        <Segmented
          options={['ALL', 'TCP', 'UDP']}
          value={filter.protocol}
          onChange={v => updateFilter('protocol', v as string)}
          size="small"
        />
        <Segmented
          options={['ALL', 'v4', 'v6']}
          value={filter.family}
          onChange={v => updateFilter('family', v as string)}
          size="small"
        />
        <Select
          mode="multiple"
          placeholder="TCP 状态"
          value={filter.states}
          onChange={v => updateFilter('states', v)}
          options={TCP_STATES.map(s => ({ label: s, value: s }))}
          size="small"
          style={{ minWidth: 120 }}
          maxTagCount={1}
          allowClear
          disabled={filter.protocol === 'UDP'}
        />
      </div>
      <div style={styles.right}>
        <Select
          value={pollingInterval}
          onChange={onPollingChange}
          size="small"
          style={{ width: 100 }}
          options={[
            { label: '关闭自动', value: 0 },
            { label: '每 2s', value: 2000 },
            { label: '每 5s', value: 5000 },
          ]}
        />
        <Button
          icon={<ReloadOutlined spin={loading} />}
          onClick={onRefresh}
          size="small"
        >
          刷新
        </Button>
        <Button
          icon={<DeleteOutlined />}
          danger
          disabled={selectedPids.length === 0}
          onClick={handleBatchKill}
          size="small"
        >
          批量 Kill ({selectedPids.length})
        </Button>
        {elevated && (
          <Tag icon={<SafetyCertificateOutlined />} color="green">
            管理员模式
          </Tag>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '8px 12px',
    borderBottom: '0.5px solid var(--color-border)',
    flexShrink: 0,
    flexWrap: 'wrap',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
}
