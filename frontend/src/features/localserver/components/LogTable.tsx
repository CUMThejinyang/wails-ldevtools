import { Button, Table, Tooltip } from 'antd'
import { ClearOutlined } from '@ant-design/icons'
import { useState } from 'react'
import type { ColumnsType } from 'antd/es/table'
import type { LogEntry } from '@/types'

const PAGE_SIZE = 50

interface Props {
  logs: LogEntry[]
  onClear: () => void
}

function statusColor(status: number): string {
  if (status >= 200 && status < 300) return 'var(--color-success)'
  if (status >= 300 && status < 400) return '#1890ff'
  if (status >= 400 && status < 500) return '#faad14'
  return 'var(--color-error)'
}

export default function LogTable({ logs, onClear }: Props) {
  const [page, setPage] = useState(1)

  const columns: ColumnsType<LogEntry> = [
    { title: '时间', dataIndex: 'time', width: 150, render: (v: string) => <span style={{ fontFamily: 'var(--code-font-family)', fontSize: 12 }}>{v}</span> },
    { title: 'IP', dataIndex: 'remoteAddr', width: 150, ellipsis: true, render: (v: string) => <span style={{ fontSize: 12 }}>{v}</span> },
    { title: 'Method', dataIndex: 'method', width: 80, render: (v: string) => <span style={{ fontFamily: 'var(--code-font-family)', fontSize: 12, fontWeight: 600 }}>{v}</span> },
    { title: 'Path', dataIndex: 'path', ellipsis: true, render: (v: string) => <span style={{ fontFamily: 'var(--code-font-family)', fontSize: 12 }}>{v}</span> },
    {
      title: 'Status', dataIndex: 'status', width: 70,
      render: (v: number) => <span style={{ color: statusColor(v), fontWeight: 600, fontSize: 12 }}>{v}</span>,
    },
    { title: 'Bytes', dataIndex: 'bytes', width: 80, render: (v: number) => <span style={{ fontSize: 12 }}>{formatBytes(v)}</span> },
    { title: '耗时', dataIndex: 'durationMs', width: 80, render: (v: number) => <span style={{ fontSize: 12 }}>{v}ms</span> },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {logs.length > 0 && (
        <div style={{ padding: '4px 12px', display: 'flex', justifyContent: 'flex-end', flexShrink: 0, borderBottom: '0.5px solid var(--color-border-soft)' }}>
          <Tooltip title="清空显示（不影响后端日志）">
            <Button type="text" size="small" icon={<ClearOutlined />} onClick={onClear}>
              清空
            </Button>
          </Tooltip>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
        <Table<LogEntry>
          dataSource={logs}
          columns={columns}
          rowKey={(_, i) => String(i)}
          size="small"
          scroll={{ y: 'calc(100% - 40px)' }}
          style={{ fontSize: 12 }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: logs.length,
            size: 'small',
            showTotal: (t) => `${t} 条`,
            onChange: (p) => setPage(p),
          }}
          expandable={{
            expandedRowRender: (record) => (
              <div style={{ fontSize: 12, color: 'var(--color-text-2)' }}>
                <div><b>完整路径:</b> {record.path}</div>
                {record.userAgent && <div><b>User-Agent:</b> {record.userAgent}</div>}
              </div>
            ),
          }}
        />
      </div>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}
