import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  List,
  message,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DiffOutlined,
  DownloadOutlined,
  ExportOutlined,
  FolderOpenOutlined,
  FunctionOutlined,
  ImportOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
  SearchOutlined,
  UndoOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import PageShell from '@/components/layout/PageShell'
import SectionCard from '@/components/layout/SectionCard'
import Toolbar from '@/components/layout/Toolbar'
import EmptyState from '@/components/feedback/EmptyState'
import PathPicker from '@/components/form/PathPicker'
import { bridge } from '@/services/bridge'
import { useMessage, useModal } from '@/hooks/useMessage'
import type {
  BackupMeta,
  BackupSnapshot,
  BatchSaveResult,
  EnvChange,
  EnvEntry,
  EnvScope,
  EnvValueType,
  ImportPreview,
  PathSegment,
  PathValidation,
} from '@/types'

type TabKey = 'variables' | 'path' | 'import' | 'backups'

type VariableModalState = {
  open: boolean
  scope: EnvScope
  initial?: EnvEntry
}

type PathModalState = {
  open: boolean
  scope: EnvScope
  index?: number
  initial?: string
}

type BatchSummary = {
  ok: boolean
  cancelled: boolean
  message: string
}

type ColumnWidthMap = Record<string, number>

type ResizableHeaderCellProps = React.ThHTMLAttributes<HTMLTableCellElement> & {
  width?: number
  onResizeStart?: (event: React.MouseEvent<HTMLSpanElement>) => void
}

const MIN_COLUMN_WIDTH = 96
const DEFAULT_COLUMN_WIDTH = 220

const RESIZABLE_TABLE_COMPONENTS = {
  header: {
    cell: ResizableHeaderCell,
  },
}

const SCOPE_OPTIONS = [
  { label: '用户变量', value: 'user' as const },
  { label: '系统变量', value: 'system' as const },
]

const TYPE_OPTIONS = [
  { label: '字符串 (REG_SZ)', value: 'sz' as const },
  { label: '可展开字符串 (REG_EXPAND_SZ)', value: 'expand_sz' as const },
]

export default function EnvPage() {
  const [messageApi, contextHolder] = message.useMessage()
  const modal = useModal()
  const [activeTab, setActiveTab] = useState<TabKey>('variables')
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<EnvEntry[]>([])
  const [backups, setBackups] = useState<BackupMeta[]>([])
  const [pendingChanges, setPendingChanges] = useState<EnvChange[]>([])
  const [originalPathSegments, setOriginalPathSegments] = useState<PathSegment[]>([])
  const [pathSegments, setPathSegments] = useState<PathSegment[]>([])
  const [search, setSearch] = useState('')
  const [highRiskVariables, setHighRiskVariables] = useState<string[]>([])
  const [isElevated, setIsElevated] = useState(false)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [importScope, setImportScope] = useState<EnvScope>('user')
  const [importFilePath, setImportFilePath] = useState('')
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const [restoreMeta, setRestoreMeta] = useState<BackupMeta | null>(null)
  const [restoreSnapshot, setRestoreSnapshot] = useState<BackupSnapshot | null>(null)
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [variableModal, setVariableModal] = useState<VariableModalState>({ open: false, scope: 'user' })
  const [pathModal, setPathModal] = useState<PathModalState>({ open: false, scope: 'user' })
  const [variableColumnWidths, setVariableColumnWidths] = useState<Record<EnvScope, ColumnWidthMap>>({
    user: {},
    system: {},
  })

  const loadAll = async () => {
    setLoading(true)
    try {
      const [userEntries, systemEntries, allPathSegments, backupList, riskyVars, elevated] = await Promise.all([
        bridge.listEnv('user'),
        bridge.listEnv('system'),
        bridge.parseAllPathSegments(),
        bridge.listBackups(),
        bridge.getHighRiskVariables(),
        bridge.isElevated(),
      ])
      setEntries([...(userEntries ?? []), ...(systemEntries ?? [])])
      setOriginalPathSegments(allPathSegments ?? [])
      setPathSegments(allPathSegments ?? [])
      setBackups(backupList ?? [])
      setHighRiskVariables(riskyVars ?? [])
      setIsElevated(!!elevated)
    } catch (error) {
      messageApi.error(getErrorMessage(error, '环境变量加载失败'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [])

  const displayedEntries = useMemo(
    () => applyEnvChanges(entries, pendingChanges),
    [entries, pendingChanges],
  )

  const filteredEntries = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return displayedEntries
    return displayedEntries.filter((entry) =>
      [entry.name, entry.value, entry.type].some((part) => part.toLowerCase().includes(keyword)),
    )
  }, [displayedEntries, search])

  const pendingPathChanges = useMemo(
    () => buildPathChanges(originalPathSegments, pathSegments),
    [originalPathSegments, pathSegments],
  )

  const previewChanges = useMemo(
    () => [...pendingChanges, ...pendingPathChanges],
    [pendingChanges, pendingPathChanges],
  )

  const pathByScope = useMemo(
    () => ({
      system: getScopeSegments(pathSegments, 'system'),
      user: getScopeSegments(pathSegments, 'user'),
    }),
    [pathSegments],
  )

  const restoreChanges = useMemo(() => {
    if (!restoreSnapshot) return []
    return diffSnapshot(entries, restoreSnapshot)
  }, [entries, restoreSnapshot])

  const resizeVariableColumn = (scope: EnvScope, key: string, width: number) => {
    setVariableColumnWidths((prev) => ({
      ...prev,
      [scope]: {
        ...prev[scope],
        [key]: Math.max(MIN_COLUMN_WIDTH, Math.round(width)),
      },
    }))
  }

  const variableColumns = (scope: EnvScope): ColumnsType<EnvEntry> => {
    const widthMap = variableColumnWidths[scope]
    const baseColumns: ColumnsType<EnvEntry> = [
      {
        title: '名称',
        dataIndex: 'name',
        key: 'name',
        width: 180,
        ellipsis: true,
        render: (value: string) => <span style={{ fontWeight: 600 }}>{value}</span>,
      },
      {
        title: '值',
        dataIndex: 'value',
        key: 'value',
        width: DEFAULT_COLUMN_WIDTH,
        ellipsis: true,
        render: (value: string) => (
          <Tooltip title={value}>
            <span style={{ fontFamily: 'var(--code-font-family)' }}>{value || '(空)'}</span>
          </Tooltip>
        ),
      },
      {
        title: '类型',
        dataIndex: 'type',
        key: 'type',
        width: 140,
        render: (value: string) => <Tag color={value === 'expand_sz' ? 'blue' : 'default'}>{value}</Tag>,
      },
      {
        title: '操作',
        key: 'actions',
        width: 120,
        render: (_, entry) => (
          <Space size={4}>
            <Button size="small" type="text" onClick={() => setVariableModal({ open: true, scope, initial: entry })}>编辑</Button>
            <Button size="small" type="text" danger onClick={() => handleDeleteVariable(entry)}>删除</Button>
          </Space>
        ),
      },
    ]

    return baseColumns.map((column) => {
      const columnKey = column.key
      const dataIndex = 'dataIndex' in column ? column.dataIndex : undefined
      const key = columnKey != null
        ? String(columnKey)
        : Array.isArray(dataIndex)
          ? dataIndex.join('.')
          : String(dataIndex ?? '')
      const width = widthMap[key] ?? (typeof column.width === 'number' ? column.width : DEFAULT_COLUMN_WIDTH)
      return {
        ...column,
        width,
        onHeaderCell: () => ({
          width,
          onResizeStart: (event: React.MouseEvent<HTMLSpanElement>) => {
            event.preventDefault()
            event.stopPropagation()
            const startX = event.clientX
            const startWidth = width
            const handleMouseMove = (moveEvent: MouseEvent) => {
              resizeVariableColumn(scope, key, startWidth + moveEvent.clientX - startX)
            }
            const handleMouseUp = () => {
              window.removeEventListener('mousemove', handleMouseMove)
              window.removeEventListener('mouseup', handleMouseUp)
            }
            window.addEventListener('mousemove', handleMouseMove)
            window.addEventListener('mouseup', handleMouseUp)
          },
        }),
      }
    })
  }

  const handleDeleteVariable = (entry: EnvEntry) => {
    const isHighRisk = highRiskVariables.some((name) => name.toLowerCase() === entry.name.toLowerCase())
    const applyDelete = () => {
      setPendingChanges((prev) => upsertEnvChange(prev, {
        name: entry.name,
        value: '',
        type: entry.type,
        scope: entry.scope,
        delete: true,
      }))
    }
    if (!isHighRisk) {
      applyDelete()
      return
    }
    modal.confirm({
      title: '确认删除高风险变量',
      content: `${entry.name} 可能影响终端、系统路径或程序启动。确认继续吗？`,
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: applyDelete,
    })
  }

  const discardChanges = () => {
    setPendingChanges([])
    setPathSegments(originalPathSegments)
    setSaveModalOpen(false)
  }

  const handleValidatePaths = async () => {
    try {
      const validations = await bridge.validatePath(pathSegments.map((segment) => segment.raw))
      setPathSegments(mergePathValidations(pathSegments, validations ?? []))
      messageApi.success('路径状态已刷新')
    } catch (error) {
      messageApi.error(getErrorMessage(error, '路径校验失败'))
    }
  }

  const handleExport = async (scope: EnvScope) => {
    try {
      const outPath = await bridge.selectSaveFile(scope === 'user' ? '导出用户环境变量' : '导出系统环境变量')
      if (!outPath) return
      const result = await bridge.exportEnvFile(scope, outPath)
      if (!result.ok) {
        messageApi.error(result.error || '导出失败')
        return
      }
      messageApi.success(`已导出到 ${outPath}`)
    } catch (error) {
      messageApi.error(getErrorMessage(error, '导出失败'))
    }
  }

  const handlePickImportFile = async () => {
    try {
      const picked = await bridge.selectFile('选择导入文件')
      if (!picked) return
      setImportFilePath(picked)
      setImportBusy(true)
      const preview = await bridge.importEnvFilePreview(picked, importScope)
      setImportPreview(preview)
    } catch (error) {
      messageApi.error(getErrorMessage(error, '导入预览失败'))
    } finally {
      setImportBusy(false)
    }
  }

  const handleRefreshImportPreview = async () => {
    if (!importFilePath) {
      messageApi.warning('请先选择导入文件')
      return
    }
    setImportBusy(true)
    try {
      const preview = await bridge.importEnvFilePreview(importFilePath, importScope)
      setImportPreview(preview)
    } catch (error) {
      messageApi.error(getErrorMessage(error, '导入预览失败'))
    } finally {
      setImportBusy(false)
    }
  }

  const handleImportCommit = async () => {
    if (!importPreview || importPreview.changes.length === 0) return
    setSaveBusy(true)
    try {
      await bridge.snapshot('pre-import')
      const result = await bridge.importEnvFileCommit(importPreview)
      await bridge.broadcastEnvChange().catch(() => undefined)
      await loadAll()
      setImportPreview(null)
      const summary = summarizeBatchResult(result)
      if (summary.ok) {
        messageApi.success('导入完成')
        return
      }
      messageApi.warning(summary.message || '部分变量未导入')
    } catch (error) {
      messageApi.error(getErrorMessage(error, '导入失败'))
    } finally {
      setSaveBusy(false)
    }
  }

  const handleOpenRestore = async (backup: BackupMeta) => {
    setRestoreBusy(true)
    try {
      const snapshot = await bridge.loadBackup(backup.id)
      setRestoreMeta(backup)
      setRestoreSnapshot(snapshot)
    } catch (error) {
      messageApi.error(getErrorMessage(error, '读取快照失败'))
    } finally {
      setRestoreBusy(false)
    }
  }

  const handleRestore = async () => {
    if (!restoreMeta) return
    setSaveBusy(true)
    try {
      const result = await bridge.restoreBackup(restoreMeta.id)
      await bridge.broadcastEnvChange().catch(() => undefined)
      await loadAll()
      setRestoreMeta(null)
      setRestoreSnapshot(null)
      const summary = summarizeBatchResult(result)
      if (summary.ok) {
        messageApi.success('快照已恢复')
        return
      }
      messageApi.warning(summary.message || '部分变量未恢复')
    } catch (error) {
      messageApi.error(getErrorMessage(error, '恢复失败'))
    } finally {
      setSaveBusy(false)
    }
  }

  const handleDeleteBackup = (backup: BackupMeta) => {
    modal.confirm({
      title: '确认删除快照',
      content: `将删除 ${formatBackupTime(backup.timestamp)} 的快照。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        const result = await bridge.deleteBackup(backup.id)
        if (!result.ok) {
          messageApi.error(result.error || '删除失败')
          return
        }
        await loadAll()
        messageApi.success('快照已删除')
      },
    })
  }

  const handleCreateSnapshot = () => {
    let note = ''
    modal.confirm({
      title: '创建快照',
      content: (
        <Input
          placeholder="可选备注，例如：改 PATH 前"
          onChange={(event) => {
            note = event.target.value
          }}
        />
      ),
      okText: '创建',
      cancelText: '取消',
      onOk: async () => {
        await bridge.snapshot(note.trim())
        await loadAll()
        messageApi.success('快照已创建')
      },
    })
  }

  const handleSave = async () => {
    if (previewChanges.length === 0) return
    setSaveBusy(true)
    const draftPaths = pathSegments
    try {
      await bridge.snapshot('pre-save')
      const envResult = pendingChanges.length > 0 ? await bridge.saveEnvBatch(pendingChanges) : undefined
      const pathResult = pendingPathChanges.length > 0 ? await bridge.savePath(pathSegments) : undefined
      await bridge.broadcastEnvChange().catch(() => undefined)
      await refreshAfterSave(envResult, pathResult, draftPaths)
      setSaveModalOpen(false)
      const summary = summarizeResults(envResult, pathResult)
      if (summary.ok) {
        messageApi.success('已保存，请注意已运行的程序需重启才能读到新值')
        return
      }
      if (summary.cancelled) {
        messageApi.warning(summary.message || '部分系统变量已取消保存')
        return
      }
      messageApi.error(summary.message || '保存失败')
    } catch (error) {
      messageApi.error(getErrorMessage(error, '保存失败'))
    } finally {
      setSaveBusy(false)
    }
  }

  const refreshAfterSave = async (
    envResult: BatchSaveResult | undefined,
    pathResult: BatchSaveResult | undefined,
    draftPaths: PathSegment[],
  ) => {
    const [userEntries, systemEntries, allPathSegments, backupList, riskyVars, elevated] = await Promise.all([
      bridge.listEnv('user'),
      bridge.listEnv('system'),
      bridge.parseAllPathSegments(),
      bridge.listBackups(),
      bridge.getHighRiskVariables(),
      bridge.isElevated(),
    ])

    const actualEntries = [...(userEntries ?? []), ...(systemEntries ?? [])]
    const actualPaths = allPathSegments ?? []
    const envRetainedScopes = failedScopesFromResult(envResult)
    const pathRetainedScopes = failedScopesFromResult(pathResult)

    setEntries(actualEntries)
    setBackups(backupList ?? [])
    setHighRiskVariables(riskyVars ?? [])
    setIsElevated(!!elevated)
    setOriginalPathSegments(actualPaths)
    setPendingChanges((prev) => prev.filter((change) => envRetainedScopes.includes(change.scope)))
    setPathSegments(mergeRetainedPathDraft(actualPaths, draftPaths, pathRetainedScopes))
  }

  return (
    <>
      {contextHolder}
      <PageShell
        title={<><FunctionOutlined style={{ color: 'var(--color-primary)', marginRight: 8 }} />环境变量编辑器</>}
        actions={(
          <Toolbar gap={8}>
            <Tooltip title={isElevated ? '当前已具备管理员权限' : '系统变量保存时会请求管理员权限'}>
              <Tag color={isElevated ? 'green' : 'gold'} icon={<SafetyCertificateOutlined />}>
                {isElevated ? '管理员' : '按需提权'}
              </Tag>
            </Tooltip>
            <Button icon={<ReloadOutlined />} onClick={() => void loadAll()}>刷新</Button>
          </Toolbar>
        )}
      >
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as TabKey)}
          size="small"
          style={{ padding: '0 16px', flexShrink: 0 }}
          items={[
            { key: 'variables', label: '变量' },
            { key: 'path', label: 'PATH' },
            { key: 'import', label: '导入 / 导出' },
            { key: 'backups', label: '快照' },
          ]}
        />

        <div style={{ flex: 1, minHeight: 0, overflow: activeTab === 'path' ? 'hidden' : 'auto', padding: '0 16px 16px', display: 'flex', flexDirection: 'column' }}>
          {previewChanges.length > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ position: 'sticky', top: 0, zIndex: 5, marginBottom: 16 }}
              message={`未保存变更 ${previewChanges.length} 项`}
              description="变量修改与 PATH 调整都会先暂存，确认 diff 后再统一写入注册表。"
              action={(
                <Space>
                  <Button size="small" icon={<UndoOutlined />} onClick={discardChanges}>放弃</Button>
                  <Button size="small" type="primary" icon={<DiffOutlined />} onClick={() => setSaveModalOpen(true)}>保存</Button>
                </Space>
              )}
            />
          )}

          {loading ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="正在加载环境变量..." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0, height: '100%', flex: 1 }}>
              {activeTab === 'variables' && (
                <SectionCard
                  title="用户 / 系统变量"
                  extra={(
                    <Toolbar gap={8}>
                      <Input
                        prefix={<SearchOutlined />}
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="搜索名称、值或类型"
                        style={{ width: 240 }}
                      />
                      <Button icon={<PlusOutlined />} onClick={() => setVariableModal({ open: true, scope: 'user' })}>新增用户变量</Button>
                      <Button icon={<PlusOutlined />} onClick={() => setVariableModal({ open: true, scope: 'system' })}>新增系统变量</Button>
                    </Toolbar>
                  )}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <VariableScopeTable
                      title="用户变量"
                      badge={`${filteredEntries.filter((entry) => entry.scope === 'user').length} 项`}
                      columns={variableColumns('user')}
                      data={filteredEntries.filter((entry) => entry.scope === 'user')}
                      emptyDescription="暂无用户变量"
                    />
                    <VariableScopeTable
                      title={<span>系统变量 <SafetyCertificateOutlined style={{ color: 'var(--color-warning)', marginLeft: 4 }} /></span>}
                      badge={`${filteredEntries.filter((entry) => entry.scope === 'system').length} 项`}
                      columns={variableColumns('system')}
                      data={filteredEntries.filter((entry) => entry.scope === 'system')}
                      emptyDescription="暂无系统变量"
                    />
                  </div>
                </SectionCard>
              )}

              {activeTab === 'path' && (
                <SectionCard
                  title="PATH 可视化编辑"
                  extra={(
                    <Toolbar gap={8}>
                      <Button icon={<PlusOutlined />} onClick={() => setPathModal({ open: true, scope: 'system' })}>新增系统路径</Button>
                      <Button icon={<PlusOutlined />} onClick={() => setPathModal({ open: true, scope: 'user' })}>新增用户路径</Button>
                      <Button icon={<FolderOpenOutlined />} onClick={() => void handleValidatePaths()}>校验</Button>
                      <Button onClick={() => setPathSegments((prev) => dedupePathSegments(prev))}>去重</Button>
                    </Toolbar>
                  )}
                  fill
                  bodyStyle={{ padding: 14, overflow: 'hidden' }}
                  style={{ flex: 1, minHeight: 0 }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12, height: '100%', minHeight: 0 }}>
                    <PathScopeList
                      title="系统 PATH"
                      items={pathByScope.system}
                      onMove={(index, delta) => setPathSegments((prev) => movePathSegment(prev, 'system', index, delta))}
                      onEdit={(index, item) => setPathModal({ open: true, scope: 'system', index, initial: item.raw })}
                      onDelete={(index) => setPathSegments((prev) => removePathSegment(prev, 'system', index))}
                    />
                    <PathScopeList
                      title="用户 PATH"
                      items={pathByScope.user}
                      onMove={(index, delta) => setPathSegments((prev) => movePathSegment(prev, 'user', index, delta))}
                      onEdit={(index, item) => setPathModal({ open: true, scope: 'user', index, initial: item.raw })}
                      onDelete={(index) => setPathSegments((prev) => removePathSegment(prev, 'user', index))}
                    />
                  </div>
                </SectionCard>
              )}

              {activeTab === 'import' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <SectionCard title="导出" extra={<ExportOutlined />}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <p style={hintStyle}>导出为 KEY=VALUE 文本，适合备份或二次编辑。</p>
                      <Button icon={<DownloadOutlined />} onClick={() => void handleExport('user')}>导出用户变量</Button>
                      <Button icon={<DownloadOutlined />} onClick={() => void handleExport('system')}>导出系统变量</Button>
                    </div>
                  </SectionCard>

                  <SectionCard title="导入" extra={<ImportOutlined />}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <p style={hintStyle}>先预览差异，再决定是否写入。错误行会跳过，不阻塞其他变量导入。</p>
                      <Select value={importScope} options={SCOPE_OPTIONS} onChange={setImportScope} />
                      <PathPicker
                        mode="file"
                        title="选择导入文件"
                        value={importFilePath}
                        onChange={setImportFilePath}
                        placeholder="选择 .env 或普通文本文件"
                      />
                      <Toolbar gap={8}>
                        <Button icon={<UploadOutlined />} loading={importBusy} onClick={() => void handlePickImportFile()}>选择并预览</Button>
                        <Button disabled={!importFilePath} onClick={() => void handleRefreshImportPreview()}>重新预览</Button>
                      </Toolbar>
                      <ImportPreviewCard preview={importPreview} />
                    </div>
                  </SectionCard>
                </div>
              )}

              {activeTab === 'backups' && (
                <SectionCard
                  title="快照历史"
                  extra={<Button icon={<SaveOutlined />} onClick={handleCreateSnapshot}>创建快照</Button>}
                >
                  <BackupList
                    backups={backups}
                    busy={restoreBusy}
                    onRestore={(backup) => void handleOpenRestore(backup)}
                    onDelete={handleDeleteBackup}
                  />
                </SectionCard>
              )}
            </div>
          )}
        </div>
      </PageShell>

      <VariableEditModal
        open={variableModal.open}
        scope={variableModal.scope}
        initial={variableModal.initial}
        onCancel={() => setVariableModal((prev) => ({ ...prev, open: false, initial: undefined }))}
        onSubmit={(change) => {
          setPendingChanges((prev) => upsertEnvChange(prev, change))
          setVariableModal({ open: false, scope: change.scope })
        }}
      />

      <PathEditModal
        open={pathModal.open}
        scope={pathModal.scope}
        initial={pathModal.initial}
        onCancel={() => setPathModal((prev) => ({ ...prev, open: false, index: undefined, initial: undefined }))}
        onSubmit={(raw) => {
          setPathSegments((prev) => upsertPathSegment(prev, pathModal.scope, pathModal.index, raw))
          setPathModal({ open: false, scope: pathModal.scope })
        }}
      />

      <DiffPreviewModal
        title="保存变更预览"
        open={saveModalOpen}
        changes={previewChanges}
        confirmText="确认保存"
        loading={saveBusy}
        onCancel={() => setSaveModalOpen(false)}
        onConfirm={() => void handleSave()}
      />

      <DiffPreviewModal
        title="导入预览"
        open={!!importPreview && importPreview.changes.length > 0}
        changes={importPreview?.changes ?? []}
        errors={importPreview?.errors ?? []}
        confirmText="确认导入"
        loading={saveBusy}
        onCancel={() => setImportPreview(null)}
        onConfirm={() => void handleImportCommit()}
      />

      <DiffPreviewModal
        title={restoreMeta ? `恢复快照：${formatBackupTime(restoreMeta.timestamp)}` : '恢复快照'}
        open={!!restoreSnapshot}
        changes={restoreChanges}
        confirmText="确认恢复"
        loading={saveBusy}
        onCancel={() => {
          setRestoreMeta(null)
          setRestoreSnapshot(null)
        }}
        onConfirm={() => void handleRestore()}
      />
    </>
  )
}

function VariableScopeTable({
  title,
  badge,
  columns,
  data,
  emptyDescription,
}: {
  title: React.ReactNode
  badge: string
  columns: ColumnsType<EnvEntry>
  data: EnvEntry[]
  emptyDescription: string
}) {
  return (
    <SectionCard title={title} extra={<Tag>{badge}</Tag>}>
      <Table<EnvEntry>
        rowKey={(entry) => `${entry.scope}:${entry.name}`}
        components={RESIZABLE_TABLE_COMPONENTS}
        columns={columns}
        dataSource={data}
        size="small"
        tableLayout="fixed"
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        locale={{ emptyText: emptyDescription }}
      />
    </SectionCard>
  )
}

function ResizableHeaderCell({ width, onResizeStart, children, style, ...props }: ResizableHeaderCellProps) {
  return (
    <th
      {...props}
      style={{
        ...style,
        width,
        position: 'relative',
      }}
    >
      {children}
      {onResizeStart && (
        <span
          onMouseDown={onResizeStart}
          style={{
            position: 'absolute',
            top: 0,
            right: -4,
            width: 8,
            height: '100%',
            cursor: 'col-resize',
            userSelect: 'none',
            touchAction: 'none',
            zIndex: 1,
          }}
        />
      )}
    </th>
  )
}

function VariableEditModal({
  open,
  scope,
  initial,
  onCancel,
  onSubmit,
}: {
  open: boolean
  scope: EnvScope
  initial?: EnvEntry
  onCancel: () => void
  onSubmit: (change: EnvChange) => void
}) {
  const [form] = Form.useForm<{ name: string; value: string; type: EnvValueType }>()

  useEffect(() => {
    if (!open) return
    form.setFieldsValue({
      name: initial?.name ?? '',
      value: initial?.value ?? '',
      type: (initial?.type as EnvValueType) ?? inferValueType(initial?.value ?? ''),
    })
  }, [form, initial, open])

  return (
    <Modal
      title={initial ? '编辑变量' : '新增变量'}
      open={open}
      okText="加入待保存"
      cancelText="取消"
      onCancel={onCancel}
      onOk={async () => {
        const values = await form.validateFields()
        onSubmit({
          name: values.name.trim(),
          value: values.value,
          type: values.type,
          scope,
        })
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入变量名' }]}>
          <Input disabled={!!initial} placeholder="例如 PATH" />
        </Form.Item>
        <Form.Item label="值" name="value" rules={[{ required: true, message: '请输入变量值' }]}>
          <Input.TextArea rows={5} placeholder="变量值" />
        </Form.Item>
        <Form.Item label="类型" name="type">
          <Select options={TYPE_OPTIONS} />
        </Form.Item>
      </Form>
    </Modal>
  )
}

function PathScopeList({
  title,
  items,
  onMove,
  onEdit,
  onDelete,
}: {
  title: string
  items: PathSegment[]
  onMove: (index: number, delta: number) => void
  onEdit: (index: number, item: PathSegment) => void
  onDelete: (index: number) => void
}) {
  return (
    <SectionCard title={title} extra={<Tag>{items.length} 条</Tag>} fill scrollBody style={{ minWidth: 0, minHeight: 0 }}>
      {items.length === 0 ? (
        <EmptyState title="暂无路径" description="点击上方新增路径，将目录加入对应作用域的 PATH。" style={{ padding: 24 }} />
      ) : (
        <List
          dataSource={items}
          renderItem={(item, index) => (
            <List.Item
              actions={[
                <Button key="up" size="small" type="text" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => onMove(index, -1)} />,
                <Button key="down" size="small" type="text" icon={<ArrowDownOutlined />} disabled={index === items.length - 1} onClick={() => onMove(index, 1)} />,
                <Button key="edit" size="small" type="text" onClick={() => onEdit(index, item)}>编辑</Button>,
                <Button key="delete" size="small" type="text" danger onClick={() => onDelete(index)}>删除</Button>,
              ]}
            >
              <List.Item.Meta
                title={<span style={{ fontFamily: 'var(--code-font-family)' }}>{item.raw}</span>}
                description={(
                  <Space wrap size={[6, 6]}>
                    <PathStateTag item={item} />
                    <Tag>{item.expanded || item.raw}</Tag>
                  </Space>
                )}
              />
            </List.Item>
          )}
        />
      )}
    </SectionCard>
  )
}

function PathStateTag({ item }: { item: PathSegment }) {
  if (item.duplicateOf >= 0) return <Tag color="orange">重复</Tag>
  if (!item.exists) return <Tag color="red">不存在</Tag>
  if (!item.isDir) return <Tag color="gold">是文件</Tag>
  return <Tag color="green">有效目录</Tag>
}

function PathEditModal({
  open,
  scope,
  initial,
  onCancel,
  onSubmit,
}: {
  open: boolean
  scope: EnvScope
  initial?: string
  onCancel: () => void
  onSubmit: (raw: string) => void
}) {
  const [value, setValue] = useState('')

  useEffect(() => {
    if (!open) return
    setValue(initial ?? '')
  }, [initial, open])

  return (
    <Modal
      title={initial ? '编辑 PATH 条目' : `新增${scope === 'system' ? '系统' : '用户'}路径`}
      open={open}
      okText="加入待保存"
      cancelText="取消"
      onCancel={onCancel}
      onOk={() => {
        if (!value.trim()) return
        onSubmit(value.trim())
      }}
    >
      <PathPicker
        mode="directory"
        title="选择目录"
        value={value}
        onChange={setValue}
        placeholder="支持手输路径，也可点击浏览"
      />
    </Modal>
  )
}

function ImportPreviewCard({ preview }: { preview: ImportPreview | null }) {
  if (!preview) {
    return <EmptyState title="尚未生成导入预览" description="选择文件后先预览，再确认是否写入。" style={{ padding: 24 }} />
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Alert
        type={preview.errors.length > 0 ? 'warning' : 'info'}
        showIcon
        message={`待导入 ${preview.changes.length} 项，解析错误 ${preview.errors.length} 项`}
      />
      {preview.errors.length > 0 && (
        <div style={{ maxHeight: 180, overflow: 'auto', border: '0.5px solid var(--color-border-soft)', borderRadius: 8, padding: 8 }}>
          {preview.errors.map((error) => (
            <div key={`${error.line}:${error.raw}`} style={{ color: 'var(--color-error)', fontSize: 12, marginBottom: 4 }}>
              第 {error.line} 行：{error.reason} — {error.raw}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BackupList({
  backups,
  busy,
  onRestore,
  onDelete,
}: {
  backups: BackupMeta[]
  busy: boolean
  onRestore: (backup: BackupMeta) => void
  onDelete: (backup: BackupMeta) => void
}) {
  if (backups.length === 0) {
    return <EmptyState title="暂无快照" description="执行重要修改前手动创建快照，或在保存时自动生成。" />
  }
  return (
    <List
      itemLayout="horizontal"
      dataSource={backups}
      renderItem={(backup) => (
        <List.Item
          actions={[
            <Button key="restore" size="small" onClick={() => onRestore(backup)} disabled={backup.corrupt} loading={busy}>恢复</Button>,
            <Button key="delete" size="small" danger type="text" onClick={() => onDelete(backup)}>删除</Button>,
          ]}
        >
          <List.Item.Meta
            title={(
              <Space size={8}>
                <span>{formatBackupTime(backup.timestamp)}</span>
                {backup.note && <Tag color="blue">{backup.note}</Tag>}
                {backup.corrupt && <Tag color="red">损坏</Tag>}
              </Space>
            )}
            description={`用户变量 ${backup.userCount} 项 · 系统变量 ${backup.systemCount} 项`}
          />
        </List.Item>
      )}
    />
  )
}

function DiffPreviewModal({
  title,
  open,
  changes,
  errors,
  confirmText,
  loading,
  onCancel,
  onConfirm,
}: {
  title: string
  open: boolean
  changes: EnvChange[]
  errors?: Array<{ line: number; raw: string; reason: string }>
  confirmText: string
  loading?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const grouped = useMemo(() => ({
    user: changes.filter((change) => change.scope === 'user'),
    system: changes.filter((change) => change.scope === 'system'),
  }), [changes])

  return (
    <Modal
      title={title}
      open={open}
      width={840}
      okText={confirmText}
      cancelText="取消"
      onCancel={onCancel}
      onOk={onConfirm}
      confirmLoading={loading}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Alert
          type="info"
          showIcon
          message={`共 ${changes.length} 项变更`}
          description="保存系统变量时会弹出管理员确认；环境变化已广播，但已有进程通常仍需重启。"
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <DiffList title="用户变量" changes={grouped.user} />
          <DiffList title="系统变量" changes={grouped.system} />
        </div>
        {errors && errors.length > 0 && (
          <SectionCard title="解析错误">
            {errors.map((error) => (
              <div key={`${error.line}:${error.raw}`} style={{ color: 'var(--color-error)', fontSize: 12, marginBottom: 4 }}>
                第 {error.line} 行：{error.reason} — {error.raw}
              </div>
            ))}
          </SectionCard>
        )}
      </div>
    </Modal>
  )
}

function DiffList({ title, changes }: { title: string; changes: EnvChange[] }) {
  return (
    <SectionCard title={title} extra={<Tag>{changes.length} 项</Tag>}>
      {changes.length === 0 ? (
        <EmptyState title="无变更" style={{ padding: 24 }} />
      ) : (
        <List
          size="small"
          dataSource={changes}
          renderItem={(change) => (
            <List.Item>
              <List.Item.Meta
                title={(
                  <Space size={8}>
                    <Tag color={change.delete ? 'red' : change.name === 'Path' ? 'blue' : 'green'}>
                      {change.delete ? '删除' : change.name === 'Path' ? '更新 PATH' : '写入'}
                    </Tag>
                    <span style={{ fontWeight: 600 }}>{change.name}</span>
                  </Space>
                )}
                description={change.delete ? '该变量将被删除。' : <span style={{ fontFamily: 'var(--code-font-family)' }}>{change.value || '(空)'}</span>}
              />
            </List.Item>
          )}
        />
      )}
    </SectionCard>
  )
}

function applyEnvChanges(entries: EnvEntry[], changes: EnvChange[]) {
  const next = new Map(entries.map((entry) => [`${entry.scope}:${entry.name.toLowerCase()}`, entry]))
  for (const change of changes) {
    const key = `${change.scope}:${change.name.toLowerCase()}`
    if (change.delete) {
      next.delete(key)
      continue
    }
    next.set(key, {
      name: change.name,
      value: change.value,
      type: change.type,
      scope: change.scope,
    })
  }
  return Array.from(next.values()).sort((a, b) => {
    if (a.scope !== b.scope) return a.scope.localeCompare(b.scope)
    return a.name.localeCompare(b.name)
  })
}

function upsertEnvChange(changes: EnvChange[], change: EnvChange) {
  const key = change.name.toLowerCase()
  const next = changes.filter((item) => !(item.scope === change.scope && item.name.toLowerCase() === key))
  next.push(change)
  return next
}

function buildPathChanges(original: PathSegment[], current: PathSegment[]): EnvChange[] {
  return (['system', 'user'] as EnvScope[]).flatMap((scope) => {
    const before = joinPath(getScopeSegments(original, scope))
    const after = joinPath(getScopeSegments(current, scope))
    if (before === after) return []
    return [{ name: 'Path', value: after, type: 'expand_sz', scope }]
  })
}

function getScopeSegments(segments: PathSegment[], scope: EnvScope) {
  return segments.filter((segment) => segment.scope === scope)
}

function joinPath(segments: PathSegment[]) {
  return segments.map((segment) => segment.raw.trim()).filter(Boolean).join(';')
}

function mergePathValidations(segments: PathSegment[], validations: PathValidation[]) {
  return recomputePathDuplicateFlags(segments.map((segment, index) => ({
    ...segment,
    expanded: validations[index]?.expandedValue ?? segment.expanded,
    exists: validations[index]?.exists ?? segment.exists,
    isDir: validations[index]?.isDir ?? segment.isDir,
  })))
}

function dedupePathSegments(segments: PathSegment[]) {
  const seen = new Set<string>()
  const next = segments.filter((segment) => {
    const key = `${segment.scope}:${segment.raw.trim().toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return recomputePathDuplicateFlags(next)
}

function recomputePathDuplicateFlags(segments: PathSegment[]) {
  const seen = new Map<string, number>()
  return segments.map((segment, index) => {
    const key = `${segment.scope}:${segment.raw.trim().toLowerCase()}`
    const duplicateOf = seen.has(key) ? (seen.get(key) as number) : -1
    if (!seen.has(key)) seen.set(key, index)
    return { ...segment, duplicateOf }
  })
}

function replaceScopeSegments(segments: PathSegment[], scope: EnvScope, nextScoped: PathSegment[]) {
  const nextSystem = scope === 'system' ? nextScoped : getScopeSegments(segments, 'system')
  const nextUser = scope === 'user' ? nextScoped : getScopeSegments(segments, 'user')
  return recomputePathDuplicateFlags([...nextSystem, ...nextUser])
}

function createDraftPathSegment(scope: EnvScope, raw: string): PathSegment {
  return {
    raw,
    expanded: raw,
    scope,
    exists: false,
    isDir: false,
    duplicateOf: -1,
  }
}

function upsertPathSegment(segments: PathSegment[], scope: EnvScope, index: number | undefined, raw: string) {
  const scoped = [...getScopeSegments(segments, scope)]
  const nextSegment = createDraftPathSegment(scope, raw)
  if (index === undefined) scoped.push(nextSegment)
  else scoped[index] = nextSegment
  return replaceScopeSegments(segments, scope, scoped)
}

function movePathSegment(segments: PathSegment[], scope: EnvScope, index: number, delta: number) {
  const scoped = [...getScopeSegments(segments, scope)]
  const nextIndex = index + delta
  if (nextIndex < 0 || nextIndex >= scoped.length) return segments
  const [item] = scoped.splice(index, 1)
  scoped.splice(nextIndex, 0, item)
  return replaceScopeSegments(segments, scope, scoped)
}

function removePathSegment(segments: PathSegment[], scope: EnvScope, index: number) {
  const scoped = [...getScopeSegments(segments, scope)]
  scoped.splice(index, 1)
  return replaceScopeSegments(segments, scope, scoped)
}

function mergeRetainedPathDraft(actual: PathSegment[], draft: PathSegment[], retainedScopes: EnvScope[]) {
  const system = retainedScopes.includes('system') ? getScopeSegments(draft, 'system') : getScopeSegments(actual, 'system')
  const user = retainedScopes.includes('user') ? getScopeSegments(draft, 'user') : getScopeSegments(actual, 'user')
  return recomputePathDuplicateFlags([...system, ...user])
}

function diffSnapshot(currentEntries: EnvEntry[], snapshot: BackupSnapshot) {
  return (['user', 'system'] as EnvScope[]).flatMap((scope) => {
    const current = currentEntries.filter((entry) => entry.scope === scope)
    const target = scope === 'user' ? snapshot.user : snapshot.system
    return diffEntryScope(current, target, scope)
  })
}

function diffEntryScope(current: EnvEntry[], target: EnvEntry[], scope: EnvScope) {
  const currentMap = new Map(current.map((entry) => [entry.name.toLowerCase(), entry]))
  const targetMap = new Map(target.map((entry) => [entry.name.toLowerCase(), entry]))
  const changes: EnvChange[] = []

  currentMap.forEach((entry, key) => {
    if (!targetMap.has(key)) {
      changes.push({ name: entry.name, value: '', type: entry.type, scope, delete: true })
    }
  })

  target.forEach((entry) => {
    const existing = currentMap.get(entry.name.toLowerCase())
    if (!existing || existing.value !== entry.value || existing.type !== entry.type) {
      changes.push({ name: entry.name, value: entry.value, type: entry.type, scope })
    }
  })

  return changes
}

function summarizeBatchResult(result: BatchSaveResult): BatchSummary {
  const messages: string[] = []
  if (!result.user.ok) messages.push(result.user.cancelled ? '用户变量已取消' : `用户变量: ${result.user.error || '保存失败'}`)
  if (!result.system.ok) messages.push(result.system.cancelled ? '系统变量已取消' : `系统变量: ${result.system.error || '保存失败'}`)
  return {
    ok: result.user.ok && result.system.ok,
    cancelled: !!result.user.cancelled || !!result.system.cancelled,
    message: messages.join('；'),
  }
}

function summarizeResults(...results: Array<BatchSaveResult | undefined>): BatchSummary {
  const messages: string[] = []
  let ok = true
  let cancelled = false
  for (const result of results) {
    if (!result) continue
    const summary = summarizeBatchResult(result)
    ok = ok && summary.ok
    cancelled = cancelled || summary.cancelled
    if (summary.message) messages.push(summary.message)
  }
  return { ok, cancelled, message: messages.join('；') }
}

function failedScopesFromResult(result?: BatchSaveResult) {
  const scopes: EnvScope[] = []
  if (!result) return scopes
  if (!result.user.ok) scopes.push('user')
  if (!result.system.ok) scopes.push('system')
  return scopes
}

function inferValueType(value: string): EnvValueType {
  return /%[^%]+%/.test(value) ? 'expand_sz' : 'sz'
}

function formatBackupTime(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleString()
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return fallback
}

const hintStyle = {
  margin: 0,
  color: 'var(--color-text-3)',
  fontSize: 12,
}
