import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Checkbox, Table, Tooltip, Breadcrumb, Empty } from 'antd'
import { message } from '@/services/message'
import {
  DownloadOutlined,
  FolderOutlined,
  FileOutlined,
  ReloadOutlined,
  HomeOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { FileItem, ServerStatus } from '@/types'
import { bridge } from '@/services/bridge'

interface Props {
  status: ServerStatus
}

export default function FileExplorer({ status }: Props) {
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(false)
  const [currentPath, setCurrentPath] = useState('')
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())

  const loadFiles = useCallback(async (subPath: string) => {
    setLoading(true)
    try {
      const items = await bridge.listServerFiles(subPath)
      setFiles(items || [])
      setCurrentPath(subPath)
      setSelectedPaths(new Set())
    } catch {
      message.error('读取文件列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status.running) {
      loadFiles('')
    } else {
      setFiles([])
      setCurrentPath('')
      setSelectedPaths(new Set())
    }
  }, [status.running, loadFiles])

  const selectableItems = useMemo(() => files, [files])
  const selectedCount = selectedPaths.size
  const allChecked = selectableItems.length > 0 && selectedCount === selectableItems.length
  const indeterminate = selectedCount > 0 && selectedCount < selectableItems.length

  const handleNavigate = useCallback((path: string) => {
    loadFiles(path)
  }, [loadFiles])

  const handleToggleItem = useCallback((item: FileItem) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(item.path)) {
        next.delete(item.path)
      } else {
        next.add(item.path)
      }
      return next
    })
  }, [])

  const handleToggleAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedPaths(new Set(selectableItems.map((item) => item.path)))
      return
    }
    setSelectedPaths(new Set())
  }, [selectableItems])

  const handleDownloadSelected = useCallback(() => {
    if (selectedPaths.size === 0) return
    const targetUrl = status.urls?.[0] || `http://127.0.0.1:${status.port}`
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = `${targetUrl}/__devtools_api/download`
    form.style.display = 'none'
    for (const p of selectedPaths) {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = 'files'
      input.value = p
      form.appendChild(input)
    }
    document.body.appendChild(form)
    form.submit()
    document.body.removeChild(form)
    message.success(`正在打包 ${selectedPaths.size} 个项目`)
  }, [selectedPaths, status.port, status.urls])

  const pathParts = currentPath ? currentPath.split('/') : []
  const breadcrumbItems = [
    <Breadcrumb.Item key="root">
      <a onClick={() => handleNavigate('')}><HomeOutlined /> 根目录</a>
    </Breadcrumb.Item>,
    ...pathParts.map((part, i) => {
      const subPath = pathParts.slice(0, i + 1).join('/')
      return (
        <Breadcrumb.Item key={subPath}>
          <a onClick={() => handleNavigate(subPath)}>{part}</a>
        </Breadcrumb.Item>
      )
    }),
  ]

  const columns: ColumnsType<FileItem> = [
    {
      title: (
        <Checkbox
          checked={allChecked}
          indeterminate={indeterminate}
          onChange={(e) => handleToggleAll(e.target.checked)}
          disabled={selectableItems.length === 0}
        />
      ),
      width: 40,
      render: (_, record) => (
        <Checkbox
          checked={selectedPaths.has(record.path)}
          onChange={() => handleToggleItem(record)}
        />
      ),
    },
    {
      title: '名称',
      dataIndex: 'name',
      ellipsis: true,
      render: (name: string, record) => {
        const icon = record.isDir
          ? <FolderOutlined style={{ color: '#faad14', marginRight: 6 }} />
          : <FileOutlined style={{ color: 'var(--color-text-3)', marginRight: 6 }} />
        if (record.isDir) {
          return <a onClick={() => handleNavigate(record.path)} style={{ fontSize: 13 }}>{icon}{name}</a>
        }
        return <span style={{ fontSize: 13 }}>{icon}{name}</span>
      },
    },
    {
      title: '大小',
      dataIndex: 'size',
      width: 100,
      render: (v: number, record) => {
        if (record.isDir) return '-'
        return <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{formatFileSize(v)}</span>
      },
    },
    {
      title: '修改时间',
      dataIndex: 'modTime',
      width: 170,
      render: (v: string) => <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{v.replace('T', ' ').slice(0, 19)}</span>,
    },
  ]

  if (!status.running) {
    return (
      <div style={styles.empty}>
        <FolderOutlined style={{ fontSize: 28, color: 'var(--color-text-3)', marginBottom: 8 }} />
        <span style={{ color: 'var(--color-text-3)', fontSize: 13 }}>服务未启动</span>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <Breadcrumb>{breadcrumbItems}</Breadcrumb>
        <div style={styles.toolbarActions}>
          <span style={styles.selectionText}>{selectedCount > 0 ? `已选 ${selectedCount} 个项目` : '未选择项目'}</span>
          <Tooltip title="刷新">
            <Button type="text" size="small" icon={<ReloadOutlined />} onClick={() => loadFiles(currentPath)} />
          </Tooltip>
          {selectedCount > 0 && (
            <Button type="primary" size="small" icon={<DownloadOutlined />} onClick={handleDownloadSelected}>
              下载 ({selectedCount})
            </Button>
          )}
        </div>
      </div>
      <div style={styles.tableWrap}>
        <Table<FileItem>
          dataSource={files}
          columns={columns}
          rowKey="path"
          size="small"
          loading={loading}
          pagination={false}
          scroll={{ y: '100%' }}
          style={{ height: '100%' }}
          locale={{
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前目录为空" />,
          }}
        />
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
    flexShrink: 0,
    borderBottom: '0.5px solid var(--color-border-soft)',
    marginBottom: 4,
    gap: 8,
    minWidth: 0,
  },
  toolbarActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  selectionText: {
    color: 'var(--color-text-3)',
    fontSize: 12,
    marginRight: 4,
  },
  tableWrap: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0' },
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}
