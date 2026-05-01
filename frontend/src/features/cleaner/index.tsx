import { useState, useEffect, useCallback } from 'react'
import { Button, Tabs, Input, Switch, Tag, Spin, Modal } from 'antd'
import { useMessage } from '@/hooks/useMessage'
import {
  PlusOutlined, PlayCircleOutlined, StopOutlined,
  DeleteOutlined, EditOutlined, FolderOutlined,
  ThunderboltOutlined, BarChartOutlined, SettingOutlined,
  RightOutlined, CheckCircleOutlined,
} from '@ant-design/icons'
import PageShell from '@/components/layout/PageShell'
import SectionCard from '@/components/layout/SectionCard'
import Toolbar from '@/components/layout/Toolbar'
import PathPicker from '@/components/form/PathPicker'
import PatternInput from '@/components/form/PatternInput'
import NumberStepper from '@/components/form/NumberStepper'
import ProgressPanel from '@/components/feedback/ProgressPanel'
import EmptyState from '@/components/feedback/EmptyState'
import StatusTag from '@/components/feedback/StatusTag'
import { bridge, formatBytes, generateId } from '@/services/bridge'
import { useWailsEvent } from '@/hooks/useWailsEvent'
import type { FolderConfig, CleanerSettings, CleanProgress, OverallResult } from '@/types'

const DEFAULT_SETTINGS: CleanerSettings = { folders: [], threadCount: 4 }
type ProgressMap = Record<string, CleanProgress>
type TabKey = 'config' | 'progress' | 'result'

export default function CleanerPage() {
  const message = useMessage()
  const [settings, setSettings] = useState<CleanerSettings>(DEFAULT_SETTINGS)
  const [progress, setProgress] = useState<ProgressMap>({})
  const [result, setResult] = useState<OverallResult | null>(null)
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>('config')

  // 添加文件夹对话框
  const [modalOpen, setModalOpen] = useState(false)
  const [formPath, setFormPath] = useState('')
  const [formName, setFormName] = useState('')
  const [formPatterns, setFormPatterns] = useState<string[]>([])
  const [formRecursive, setFormRecursive] = useState(true)
  const [formDeleteEmptyDirs, setFormDeleteEmptyDirs] = useState(true)
  const [formDeleteFolder, setFormDeleteFolder] = useState(false)

  // 加载配置
  useEffect(() => {
    bridge.getCleanerSettings().then(setSettings).catch(() => {}).finally(() => setLoading(false))
    bridge.isCleanRunning().then(setRunning).catch(() => {})
  }, [])

  // 事件监听
  useWailsEvent<CleanProgress>('cleaner:progress', (p) => {
    setProgress((prev) => ({ ...prev, [p.folderId]: p }))
  })

  useWailsEvent<OverallResult>('cleaner:completed', (r) => {
    setResult(r)
    setRunning(false)
    setTab('result')
  })

  const save = useCallback(async (s: CleanerSettings) => {
    setSettings(s)
    try { await bridge.saveCleanerSettings(s) } catch {}
  }, [])

  const enabledCount = settings.folders.filter((f) => f.enabled).length

  const startClean = async () => {
    setProgress({})
    setResult(null)
    setRunning(true)
    setTab('progress')
    try { await bridge.startClean(settings) }
    catch (e) { setRunning(false); message.error(String(e)) }
  }

  const resetForm = () => {
    setFormPath('')
    setFormName('')
    setFormPatterns([])
    setFormRecursive(true)
    setFormDeleteEmptyDirs(true)
    setFormDeleteFolder(false)
  }

  const doAddFolder = () => {
    if (!formPath) {
      message.warning('请选择文件夹路径')
      return false
    }
    const newFolder: FolderConfig = {
      id: generateId(),
      name: formName || formPath.split(/[/\\]/).pop() || '未命名',
      path: formPath,
      patterns: formPatterns,
      recursive: formRecursive,
      deleteEmptyDirs: formDeleteEmptyDirs,
      deleteFolder: formDeleteFolder,
      enabled: true,
    }
    save({ ...settings, folders: [...settings.folders, newFolder] })
    return true
  }

  const applyAdd = () => {
    if (doAddFolder()) resetForm()
  }

  const confirmAdd = () => {
    if (doAddFolder()) setModalOpen(false)
  }

  const removeFolder = (id: string) =>
    save({ ...settings, folders: settings.folders.filter((f) => f.id !== id) })

  const updateFolder = (id: string, patch: Partial<FolderConfig>) =>
    save({ ...settings, folders: settings.folders.map((f) => f.id === id ? { ...f, ...patch } : f) })

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><Spin /></div>

  return (
    <PageShell
      title={<><DeleteOutlined style={{ color: 'var(--color-primary)', marginRight: 8 }} />文件夹清理</>}
      actions={
        <Toolbar gap={8}>
          <Button icon={<PlusOutlined />} onClick={() => { resetForm(); setModalOpen(true) }} disabled={running}>
            添加文件夹
          </Button>
          {!running
            ? <Button type="primary" icon={<PlayCircleOutlined />} onClick={startClean} disabled={enabledCount === 0}>开始清理</Button>
            : <Button danger icon={<StopOutlined />} onClick={() => bridge.stopClean()}>停止</Button>
          }
        </Toolbar>
      }
    >
      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as TabKey)}
        size="small"
        style={{ padding: '0 16px', flexShrink: 0 }}
        items={[
          { key: 'config', label: <span><FolderOutlined /> 文件夹配置{enabledCount > 0 ? ` (${enabledCount})` : ''}</span> },
          { key: 'progress', label: <span><ThunderboltOutlined /> 清理进度{running ? ' ●' : ''}</span> },
          { key: 'result', label: <span><BarChartOutlined /> 清理结果</span> },
        ]}
      />

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: '0 16px 16px', display: 'flex', flexDirection: 'column' }}>
        {tab === 'config' && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <ConfigTab
              settings={settings}
              running={running}
              onSave={save}
              onUpdateFolder={updateFolder}
              onRemoveFolder={removeFolder}
            />
          </div>
        )}
        {tab === 'progress' && (
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <ProgressTab
              folders={settings.folders.filter((f) => f.enabled)}
              progress={progress}
              running={running}
            />
          </div>
        )}
        {tab === 'result' && (
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <ResultTab result={result} />
          </div>
        )}
      </div>

      {/* 添加文件夹对话框 */}
      <Modal
        title="添加文件夹"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        width={500}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setModalOpen(false)}>取消</Button>
            <Button type="primary" ghost onClick={applyAdd}>应用</Button>
            <Button type="primary" onClick={confirmAdd}>确定</Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, color: 'var(--color-text-2)', fontWeight: 500 }}>
              文件夹路径 <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <PathPicker
              value={formPath}
              onChange={(v) => {
                setFormPath(v)
                if (!formName) {
                  const auto = v.split(/[/\\]/).pop() || ''
                  if (auto) setFormName(auto)
                }
              }}
              placeholder="C:\Users\... 或点击浏览"
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, color: 'var(--color-text-2)', fontWeight: 500 }}>显示名称</label>
            <Input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="留空则使用文件夹名"
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, color: 'var(--color-text-2)', fontWeight: 500 }}>
              文件模式 <span style={{ color: 'var(--color-text-3)', fontWeight: 400 }}>空则匹配全部文件</span>
            </label>
            <PatternInput
              value={formPatterns}
              onChange={setFormPatterns}
              placeholder="回车添加，如 *.log"
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 13, color: 'var(--color-text-2)', fontWeight: 500 }}>清理选项</label>
            <OptionRow label="递归删除子目录内的文件" desc="进入所有子目录执行删除" checked={formRecursive} onChange={setFormRecursive} />
            <OptionRow label="删除空文件夹" desc="文件删除后清理空目录" checked={formDeleteEmptyDirs} onChange={setFormDeleteEmptyDirs} />
            <OptionRow label="删除该文件夹本身" desc="清理完成后删除配置的根文件夹" checked={formDeleteFolder} onChange={setFormDeleteFolder} danger />
          </div>
        </div>
      </Modal>
    </PageShell>
  )
}

// ── 配置 Tab ──
function ConfigTab({ settings, running, onSave, onUpdateFolder, onRemoveFolder }: {
  settings: CleanerSettings
  running: boolean
  onSave: (s: CleanerSettings) => void
  onUpdateFolder: (id: string, patch: Partial<FolderConfig>) => void
  onRemoveFolder: (id: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: '100%' }}>
      {/* 全局设置 */}
      <SectionCard title={<><SettingOutlined /> 全局设置</>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-2)', fontWeight: 500 }}>并发线程数</span>
            <NumberStepper
              value={settings.threadCount}
              onChange={(v) => onSave({ ...settings, threadCount: v })}
              min={1} max={16} disabled={running}
              suffix="线程"
            />
          </div>
          <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>推荐 2-8，过高可能降低磁盘性能</span>
        </div>
      </SectionCard>

      {/* 文件夹列表 */}
      <SectionCard
        title={<><FolderOutlined /> 文件夹列表</>}
        extra={<Tag color="blue">{settings.folders.length} 项</Tag>}
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
        bodyStyle={{ flex: 1, minHeight: 0, padding: 0, overflow: 'hidden' }}
      >
        {settings.folders.length === 0 ? (
          <div style={{ padding: 14 }}>
            <EmptyState
              icon={<DeleteOutlined style={{ fontSize: 36 }} />}
              title="还没有添加文件夹"
              description="点击右上角「添加文件夹」开始配置"
            />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'auto', height: 'calc(100vh - 350px)'}}>
            {settings.folders.map((folder) => (
              <FolderCard
                key={folder.id}
                folder={folder}
                disabled={running}
                onUpdate={(patch) => onUpdateFolder(folder.id, patch)}
                onRemove={() => onRemoveFolder(folder.id)}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

// ── 文件夹卡片（点击展开编辑）──
function FolderCard({ folder, disabled, onUpdate, onRemove }: {
  folder: FolderConfig
  disabled: boolean
  onUpdate: (patch: Partial<FolderConfig>) => void
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(!folder.path) // 新建的默认展开
  const [patterns, setPatterns] = useState(folder.patterns)
  const [name, setName] = useState(folder.name)
  const [path, setPath] = useState(folder.path)

  // 同步外部更新
  useEffect(() => {
    setName(folder.name)
    setPath(folder.path)
    setPatterns(folder.patterns)
  }, [folder.name, folder.path, folder.patterns])

  const handlePathChange = (v: string) => {
    setPath(v)
    if (!name || name === path.split(/[/\\]/).pop()) {
      const auto = v.split(/[/\\]/).pop() || ''
      if (auto) { setName(auto); onUpdate({ name: auto }) }
    }
    onUpdate({ path: v })
  }

  return (
    <div style={{
      borderBottom: '0.5px solid var(--color-border-soft)',
      opacity: folder.enabled ? 1 : 0.5,
      transition: 'opacity 0.2s',
    }}>
      {/* 折叠头 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px', cursor: 'pointer',
      }} onClick={() => setExpanded(!expanded)}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 20, height: 20, flexShrink: 0,
          color: 'var(--color-text-3)', fontSize: 12,
          transition: 'transform 0.2s',
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
        }}>
          <RightOutlined />
        </span>
        <span onClick={(e) => e.stopPropagation()}>
          <Switch
            size="small"
            checked={folder.enabled}
            onChange={(v) => onUpdate({ enabled: v })}
            disabled={disabled}
          />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 500, color: 'var(--color-text-1)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {folder.name}
          </div>
          <div style={{
            fontSize: 11, color: 'var(--color-text-3)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {folder.path || '未设置路径'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
          {folder.recursive && <Tag color="green" style={{ margin: 0 }}>递归</Tag>}
          {folder.deleteEmptyDirs && <Tag color="blue" style={{ margin: 0 }}>空目录</Tag>}
          {folder.deleteFolder && <Tag color="red" style={{ margin: 0 }}>删文件夹</Tag>}
        </div>
        <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={(e) => { e.stopPropagation(); onRemove() }} disabled={disabled} />
      </div>

      {/* 展开编辑区 */}
      {expanded && (
        <div style={{
          padding: '4px 12px 14px 42px',
          display: 'flex', flexDirection: 'column', gap: 12,
          backgroundColor: 'var(--color-background)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--color-text-2)', fontWeight: 500 }}>
              文件夹路径 <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <PathPicker
              value={path}
              onChange={handlePathChange}
              placeholder="C:\Users\... 或点击浏览"
              disabled={disabled}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--color-text-2)', fontWeight: 500 }}>显示名称</label>
            <Input
              value={name}
              onChange={(e) => { setName(e.target.value); onUpdate({ name: e.target.value }) }}
              placeholder="留空则使用文件夹名"
              disabled={disabled}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--color-text-2)', fontWeight: 500 }}>
              文件模式 <span style={{ color: 'var(--color-text-3)', fontWeight: 400 }}>空则匹配全部文件</span>
            </label>
            <PatternInput
              value={patterns}
              onChange={(v) => { setPatterns(v); onUpdate({ patterns: v }) }}
              placeholder="回车添加，如 *.log"
              disabled={disabled}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 12, color: 'var(--color-text-2)', fontWeight: 500 }}>清理选项</label>
            <OptionRow label="递归删除子目录内的文件" desc="进入所有子目录执行删除" checked={folder.recursive} onChange={(v) => onUpdate({ recursive: v })} disabled={disabled} />
            <OptionRow label="删除空文件夹" desc="文件删除后清理空目录" checked={folder.deleteEmptyDirs} onChange={(v) => onUpdate({ deleteEmptyDirs: v })} disabled={disabled} />
            <OptionRow label="删除该文件夹本身" desc="清理完成后删除配置的根文件夹" checked={folder.deleteFolder} onChange={(v) => onUpdate({ deleteFolder: v })} disabled={disabled} danger />
          </div>
        </div>
      )}
    </div>
  )
}

// ── 选项行 ──
function OptionRow({ label, desc, checked, onChange, danger, disabled }: {
  label: string; desc: string; checked: boolean; onChange: (v: boolean) => void; danger?: boolean; disabled?: boolean
}) {
  return (
    <label style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
      padding: '8px 10px', borderRadius: 7,
      backgroundColor: checked && danger ? 'rgba(255,77,80,0.07)' : 'var(--color-background-mute)',
      border: `0.5px solid ${checked && danger ? 'rgba(255,77,80,0.3)' : 'var(--color-border-soft)'}`,
      transition: 'background-color 0.15s',
      opacity: disabled ? 0.6 : 1,
    }}>
      <Switch
        size="small"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        style={{ marginTop: 2 }}
      />
      <div>
        <div style={{
          fontSize: 13, fontWeight: 500,
          color: danger ? (checked ? 'var(--color-error)' : 'var(--color-text-2)') : 'var(--color-text-1)',
        }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 1 }}>{desc}</div>
      </div>
    </label>
  )
}

// ── 进度 Tab ──
function ProgressTab({ folders, progress, running }: {
  folders: FolderConfig[]
  progress: ProgressMap
  running: boolean
}) {
  if (Object.keys(progress).length === 0 && !running) {
    return (
      <EmptyState
        icon={<ThunderboltOutlined style={{ fontSize: 36, color: 'var(--color-text-3)' }} />}
        title="尚未开始清理"
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {folders.map((folder) => {
        const p = progress[folder.id]
        return (
          <ProgressPanel
            key={folder.id}
            title={folder.name}
            current={p?.deletedFiles ?? 0}
            total={p?.totalFiles ?? 0}
            currentFile={p?.currentFile}
            status={p?.status ?? 'pending'}
          />
        )
      })}
    </div>
  )
}

// ── 结果 Tab ──
function ResultTab({ result }: { result: OverallResult | null }) {
  if (!result) {
    return (
      <EmptyState
        icon={<CheckCircleOutlined style={{ fontSize: 36, color: 'var(--color-text-3)' }} />}
        title="暂无清理结果"
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 统计卡片 */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { value: String(result.totalDeleted), label: '删除文件数', highlight: true },
          { value: formatBytes(result.totalSize), label: '释放空间', highlight: true },
          { value: result.duration, label: '总耗时' },
          ...(result.cancelled ? [{ value: '已取消', label: '状态', highlight: false }] : []),
        ].map((s) => (
          <div key={s.label} style={{
            flex: 1, minWidth: 110,
            backgroundColor: 'var(--color-background-soft)',
            border: '0.5px solid var(--color-border)',
            borderRadius: 10, padding: '14px 18px', textAlign: 'center',
          }}>
            <div style={{
              fontSize: 20, fontWeight: 700, marginBottom: 4,
              color: s.highlight ? 'var(--color-primary)' : 'var(--color-text-1)',
            }}>{s.value}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 各文件夹结果 */}
      <SectionCard title={<><FolderOutlined /> 各文件夹</>}>
        {result.results?.map((r) => (
          <div key={r.folderId} style={{
            display: 'flex', alignItems: 'flex-start', gap: 16,
            padding: '12px 16px',
            borderBottom: '0.5px solid var(--color-border-soft)',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 500, color: 'var(--color-text-1)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{r.folderName}</div>
              <div style={{
                fontSize: 11, color: 'var(--color-text-3)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{r.path}</div>
              {r.error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <StatusTag status="error" />
                  <span style={{ fontSize: 12, color: 'var(--color-error)' }}>{r.error}</span>
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ color: 'var(--color-text-1)', fontSize: 13 }}>{r.deletedFiles} 个</div>
              <div style={{ color: 'var(--color-text-3)', fontSize: 12 }}>{formatBytes(r.deletedSize)}</div>
              <div style={{ color: 'var(--color-text-3)', fontSize: 11 }}>{r.duration}</div>
            </div>
          </div>
        ))}
      </SectionCard>
    </div>
  )
}
