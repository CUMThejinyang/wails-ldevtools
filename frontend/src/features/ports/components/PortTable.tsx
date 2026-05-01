import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { Table, Button, Tag, Tooltip } from 'antd'
import { useMessage, useModal } from '@/hooks/useMessage'
import { GlobalOutlined, StopOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { TableProps } from 'antd'
import { bridge } from '@/services/bridge'
import type { PortEntry } from '@/types'

const HTTP_PORTS = new Set([
  80, 81, 443, 3000, 3001, 4000, 4200, 5000, 5001, 5173, 5432, 6006, 8000, 8080, 8081, 8888, 9000, 9090,
])

const STATE_COLORS: Record<string, string> = {
  LISTEN: 'green',
  ESTABLISHED: 'blue',
  TIME_WAIT: 'default',
  CLOSE_WAIT: 'orange',
  SYN_SENT: 'purple',
  SYN_RCVD: 'purple',
  FIN_WAIT_1: 'default',
  FIN_WAIT_2: 'default',
  CLOSING: 'default',
  LAST_ACK: 'orange',
  CLOSED: 'default',
  STATELESS: 'default',
}

interface Props {
  data: PortEntry[]
  loading: boolean
  filter: {
    portKeyword: string
    pidKeyword: string
    processKeyword: string
    protocol: string
    family: string
    states: string[]
  }
  selectedRowKeys: string[]
  onSelectedRowKeysChange: (keys: string[]) => void
  onSelectedPidsChange: (pids: number[]) => void
  onKillDone: () => void
}

export default function PortTable({
  data,
  loading,
  filter,
  selectedRowKeys,
  onSelectedRowKeysChange,
  onSelectedPidsChange,
  onKillDone,
}: Props) {
  const message = useMessage()
  const modal = useModal()
  const containerRef = useRef<HTMLDivElement>(null)
  const [tableHeight, setTableHeight] = useState<number>(400)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height
        if (h > 0) setTableHeight(Math.floor(h))
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const handleKill = useCallback((entry: PortEntry) => {
    modal.confirm({
      title: '确认结束进程',
      content: `即将结束 ${entry.processName} (PID ${entry.pid})`,
      okText: '结束',
      okButtonProps: { danger: true },
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        try {
          await bridge.killPortProcess(entry.pid)
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
  }, [modal, message, onKillDone])

  const handleOpenBrowser = useCallback(async (port: number) => {
    try {
      await bridge.openInBrowser(`http://127.0.0.1:${port}`)
    } catch {
      message.error('打开浏览器失败')
    }
  }, [])

  const handleRowDoubleClick = useCallback((record: PortEntry) => {
    if (
      record.protocol === 'TCP' &&
      record.state === 'LISTEN' &&
      HTTP_PORTS.has(record.localPort)
    ) {
      handleOpenBrowser(record.localPort)
    }
  }, [handleOpenBrowser])

  const filteredData = useMemo(() => {
    let result = data

    if (filter.protocol !== 'ALL') {
      result = result.filter(e => e.protocol === filter.protocol)
    }

    if (filter.family !== 'ALL') {
      result = result.filter(e => e.family === filter.family)
    }

    if (filter.states.length > 0) {
      result = result.filter(e =>
        e.protocol === 'UDP' || filter.states.includes(e.state)
      )
    }

    const portKeyword = filter.portKeyword.trim()
    if (portKeyword) {
      result = result.filter(e => String(e.localPort).includes(portKeyword))
    }

    const pidKeyword = filter.pidKeyword.trim()
    if (pidKeyword) {
      result = result.filter(e => String(e.pid).includes(pidKeyword))
    }

    const processKeyword = filter.processKeyword.trim().toLowerCase()
    if (processKeyword) {
      result = result.filter(e => e.processName.toLowerCase().includes(processKeyword))
    }

    return result
  }, [data, filter.portKeyword, filter.pidKeyword, filter.processKeyword, filter.protocol, filter.family, filter.states])

  const rowSelection = {
    columnWidth: 40,
    fixed: true as const,
    selectedRowKeys,
    onChange: (keys: React.Key[]) => {
      onSelectedRowKeysChange(keys as string[])
      const pids = new Set<number>()
      for (const k of keys) {
        const entry = filteredData.find(e =>
          `${e.protocol}-${e.family}-${e.localAddr}:${e.localPort}-${e.pid}` === k
        )
        if (entry) pids.add(entry.pid)
      }
      onSelectedPidsChange(Array.from(pids))
    },
  }

  const columns = useMemo<ColumnsType<PortEntry>>(() => [
    {
      title: '协议',
      dataIndex: 'protocol',
      width: 60,
      sorter: (a, b) => a.protocol.localeCompare(b.protocol),
    },
    {
      title: '本地地址',
      dataIndex: 'localAddr',
      width: 140,
      sorter: (a, b) => a.localAddr.localeCompare(b.localAddr),
    },
    {
      title: '本地端口',
      dataIndex: 'localPort',
      width: 90,
      defaultSortOrder: 'ascend',
      sorter: (a, b) => a.localPort - b.localPort,
    },
    {
      title: '状态',
      dataIndex: 'state',
      width: 110,
      render: (state: string) => (
        <Tag color={STATE_COLORS[state] ?? 'default'} style={{ margin: 0 }}>
          {state}
        </Tag>
      ),
      sorter: (a, b) => a.state.localeCompare(b.state),
    },
    {
      title: '远程',
      width: 140,
      render: (_: unknown, r: PortEntry) =>
        r.protocol === 'TCP' && r.state !== 'LISTEN'
          ? `${r.remoteAddr}:${r.remotePort}`
          : '-',
      sorter: (a, b) => `${a.remoteAddr}:${a.remotePort}`.localeCompare(`${b.remoteAddr}:${b.remotePort}`),
    },
    {
      title: 'PID',
      dataIndex: 'pid',
      width: 70,
      sorter: (a, b) => a.pid - b.pid,
    },
    {
      title: '进程名',
      dataIndex: 'processName',
      width: 150,
      ellipsis: true,
      sorter: (a, b) => a.processName.localeCompare(b.processName),
    },
    {
      title: '路径',
      dataIndex: 'exePath',
      width: 200,
      ellipsis: true,
      sorter: (a, b) => a.exePath.localeCompare(b.exePath),
    },
    {
      title: '操作',
      width: 80,
      fixed: 'right',
      render: (_: unknown, record: PortEntry) => {
        const canOpen = record.protocol === 'TCP' &&
          record.state === 'LISTEN' &&
          HTTP_PORTS.has(record.localPort)
        return (
          <div style={{ display: 'flex', gap: 4 }}>
            <Tooltip title={canOpen ? '在浏览器打开' : ''}>
              <Button
                type="text"
                size="small"
                icon={<GlobalOutlined />}
                disabled={!canOpen}
                onClick={() => canOpen && handleOpenBrowser(record.localPort)}
              />
            </Tooltip>
            <Tooltip title="Kill 进程">
              <Button
                type="text"
                size="small"
                danger
                icon={<StopOutlined />}
                onClick={() => handleKill(record)}
              />
            </Tooltip>
          </div>
        )
      },
    },
  ], [handleKill, handleOpenBrowser])

  const tableKey = `${filter.protocol}-${filter.family}-${filter.states.join(',')}-${filter.portKeyword}-${filter.pidKeyword}-${filter.processKeyword}`
  const tableDataSource = useMemo<TableProps<PortEntry>['dataSource']>(() => filteredData.map(entry => ({ ...entry })), [filteredData])

  const scrollX = columns.reduce((sum, c) => sum + (typeof c.width === 'number' ? c.width : 0), 0)

  return (
    <div ref={containerRef} style={{ flex: 1, minHeight: 0 }}>
      <Table<PortEntry>
        key={tableKey}
        dataSource={tableDataSource}
        columns={columns}
        rowKey={r => `${r.protocol}-${r.family}-${r.localAddr}:${r.localPort}-${r.pid}`}
        size="small"
        loading={loading}
        rowSelection={rowSelection}
        onRow={(record) => ({
          onDoubleClick: () => handleRowDoubleClick(record),
        })}
        tableLayout="fixed"
        scroll={{ x: scrollX, y: tableHeight - 39 }}
        pagination={false}
        virtual={filteredData.length > 500}
      />
    </div>
  )
}
