import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Button, Tabs, Switch, Modal, Table, Tag, Tooltip, Spin, message,
} from 'antd'
import {
  PlayCircleOutlined, StopOutlined, EyeOutlined,
  SwapOutlined, FolderOutlined, ReloadOutlined,
  SettingOutlined, SearchOutlined, ThunderboltOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import PageShell from '@/components/layout/PageShell'
import SectionCard from '@/components/layout/SectionCard'
import Toolbar from '@/components/layout/Toolbar'
import PathPicker from '@/components/form/PathPicker'
import PatternInput from '@/components/form/PatternInput'
import NumberStepper from '@/components/form/NumberStepper'
import ProgressPanel from '@/components/feedback/ProgressPanel'
import EmptyState from '@/components/feedback/EmptyState'
import { bridge, formatBytes } from '@/services/bridge'
import { useWailsEvent } from '@/hooks/useWailsEvent'
import type { ConflictMode, SyncConfig, SyncPreviewItem, SyncFileStatus } from '@/types'

type TabKey = 'config' | 'preview' | 'progress'

interface FileProgress {
  status: SyncFileStatus
  bytesCopied: number
  totalBytes: number
  error?: string
}

interface SyncResult {
  synced: number
  skipped: number
  errors: number
  totalSize: number
  duration: string
  cancelled: boolean
}

interface ConflictReq {
  relativePath: string
  srcPath: string
  dstPath: string
  srcSize: number
  dstSize: number
}

export default function SyncPage() {
  const [tab, setTab] = useState<TabKey>('config')
  const [src, setSrc] = useState('')
  const [dst, setDst] = useState('')
  const [conflict, setConflict] = useState<ConflictMode>('overwrite')
  const [recursive, setRecursive] = useState(true)
  const [patterns, setPatterns] = useState<string[]>([])
  const [threadCount, setThreadCount] = useState(4)

  const [running, setRunning] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<SyncPreviewItem[]>([])
  const [fileProgress, setFileProgress] = useState<Record<string, FileProgress>>({})
  const [result, setResult] = useState<SyncResult | null>(null)
  const [conflictReq, setConflictReq] = useState<ConflictReq | null>(null)
  const autoDecision = useRef<string | null>(null)

  // 加载已保存配置
  useEffect(() => {
    bridge.getSyncConfig().then((cfg) => {
      setSrc(cfg.src || '')
      setDst(cfg.dst || '')
      setConflict(cfg.conflict || 'overwrite')
      setRecursive(cfg.recursive !== false)
      setPatterns(cfg.patterns || [])
      setThreadCount(cfg.threadCount || 4)
    }).catch(() => {})
    bridge.isSyncRunning().then((r) => { if (r) { setRunning(true); setTab('progress') } }).catch(() => {})
  }, [])

  // 事件监听
  useWailsEvent<{ relativePath: string; status: SyncFileStatus; bytesCopied: number; totalBytes: number; error?: string }>(
    'sync:progress',
    (p) => {
      setFileProgress((prev) => ({
        ...prev,
        [p.relativePath]: { status: p.status, bytesCopied: p.bytesCopied, totalBytes: p.totalBytes, error: p.error },
      }))
    },
  )

  useWailsEvent<SyncResult>('sync:completed', (r) => {
    setResult(r)
    setRunning(false)
    setTab('progress')
  })

  useWailsEvent<ConflictReq>('sync:conflict', (req) => {
    if (autoDecision.current) {
      bridge.resolveSyncConflict(autoDecision.current).catch(() => {})
    } else {
      setConflictReq(req)
    }
  })

  const currentConfig = useCallback((): SyncConfig => ({
    src, dst, conflict, recursive, threadCount, patterns,
  }), [src, dst, conflict, recursive, patterns, threadCount])

  const saveAndGet = () => {
    const cfg = currentConfig()
    bridge.saveSyncConfig(cfg).catch(() => {})
    return cfg
  }

  const doPreview = async () => {
    const cfg = saveAndGet()
    if (!cfg.src || !cfg.dst) return
    setPreviewing(true)
    setTab('preview')
    try {
      const items = await bridge.previewSync(cfg)
      setPreview(items || [])
    } catch (e) { message.error(String(e)) }
    finally { setPreviewing(false) }
  }

  const doStart = async () => {
    const cfg = saveAndGet()
    if (!cfg.src || !cfg.dst) return
    setFileProgress({})
    setResult(null)
    autoDecision.current = null
    setRunning(true)
    setTab('progress')
    try { await bridge.startSync(cfg) }
    catch (e) { setRunning(false); message.error(String(e)) }
  }

  const resolveConflict = (decision: string, applyAll: boolean) => {
    if (applyAll) autoDecision.current = decision
    setConflictReq(null)
    bridge.resolveSyncConflict(decision).catch(() => {})
  }

  // 进度统计
  const progItems = Object.entries(fileProgress)
  const progDone = progItems.filter(([, v]) => v.status === 'synced').length
  const progSync = progItems.filter(([, v]) => v.status === 'syncing').length
  const progSkip = progItems.filter(([, v]) => v.status === 'skipped').length
  const progErr = progItems.filter(([, v]) => v.status === 'error').length
  const progTotal = progItems.filter(([, v]) => v.status !== 'skipped' && v.status !== 'identical').length
  const progPct = progTotal > 0 ? Math.min(100, Math.round((progDone / progTotal) * 100)) : 0

  return (
    <PageShell
      title={<><SyncOutlined style={{ color: 'var(--color-primary)', marginRight: 8 }} />文件夹同步</>}
      actions={
        <Toolbar gap={8}>
          <Button icon={<EyeOutlined />} onClick={doPreview} disabled={!src || !dst || running}>预览</Button>
          {!running
            ? <Button type="primary" icon={<PlayCircleOutlined />} onClick={doStart} disabled={!src || !dst}>开始同步</Button>
            : <Button danger icon={<StopOutlined />} onClick={() => bridge.stopSync()}>停止</Button>
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
          { key: 'config', label: <span><SettingOutlined /> 配置</span> },
          { key: 'preview', label: <span><SearchOutlined /> 预览{preview.length > 0 ? ` (${preview.length})` : ''}</span> },
          { key: 'progress', label: <span><ThunderboltOutlined /> 同步进度{running ? ' ●' : ''}</span> },
        ]}
      />

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 16px 16px' }}>
        {tab === 'config' && (
          <ConfigTab
            src={src} dst={dst} conflict={conflict} recursive={recursive}
            patterns={patterns} threadCount={threadCount} running={running}
            onSrcChange={setSrc} onDstChange={setDst} onConflictChange={setConflict}
            onRecursiveChange={setRecursive} onPatternsChange={setPatterns}
            onThreadCountChange={setThreadCount}
            onSwapPaths={() => { setSrc(dst); setDst(src) }}
          />
        )}
        {tab === 'preview' && <PreviewTab previewing={previewing} preview={preview} />}
        {tab === 'progress' && (
          <ProgressTab
            fileProgress={fileProgress} running={running} result={result}
            progDone={progDone} progSync={progSync} progSkip={progSkip}
            progErr={progErr} progTotal={progTotal} progPct={progPct}
          />
        )}
      </div>

      {/* 冲突弹窗 */}
      {conflictReq && (
        <Modal
          title="文件冲突"
          open={!!conflictReq}
          footer={null}
          closable={false}
          width={420}
        >
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-2)', marginBottom: 8 }}>目标路径已存在同名文件：</div>
            <div style={{
              fontSize: 12, fontFamily: 'var(--code-font-family)', color: 'var(--color-text-1)',
              backgroundColor: 'var(--color-background-mute)', padding: '6px 10px', borderRadius: 6, wordBreak: 'break-all',
            }}>
              {conflictReq.relativePath}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--color-text-3)', marginBottom: 14 }}>
            <span>源：<b style={{ color: 'var(--color-text-2)' }}>{formatBytes(conflictReq.srcSize)}</b></span>
            <span>目标：<b style={{ color: 'var(--color-text-2)' }}>{formatBytes(conflictReq.dstSize)}</b></span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => resolveConflict('skip', false)}>跳过</Button>
            <Button onClick={() => resolveConflict('skip', true)}>全部跳过</Button>
            <Button type="primary" onClick={() => resolveConflict('overwrite', false)}>覆盖</Button>
            <Button type="primary" onClick={() => resolveConflict('overwrite', true)}>全部覆盖</Button>
          </div>
        </Modal>
      )}
    </PageShell>
  )
}

// ── 配置 Tab ──
function ConfigTab({ src, dst, conflict, recursive, patterns, threadCount, running,
  onSrcChange, onDstChange, onConflictChange, onRecursiveChange, onPatternsChange,
  onThreadCountChange, onSwapPaths,
}: {
  src: string; dst: string; conflict: ConflictMode; recursive: boolean
  patterns: string[]; threadCount: number; running: boolean
  onSrcChange: (v: string) => void
  onDstChange: (v: string) => void
  onConflictChange: (v: ConflictMode) => void
  onRecursiveChange: (v: boolean) => void
  onPatternsChange: (v: string[]) => void
  onThreadCountChange: (v: number) => void
  onSwapPaths: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 路径 */}
      <SectionCard title={<><FolderOutlined /> 同步路径</>}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)' }}>源文件夹</label>
            <PathPicker value={src} onChange={onSrcChange} placeholder="选择源文件夹..." disabled={running} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 56, paddingTop: 24, flexShrink: 0 }}>
            <Tooltip title="互换路径">
              <Button
                shape="circle"
                icon={<SwapOutlined />}
                onClick={onSwapPaths}
                disabled={running}
                style={{ width: 36, height: 36 }}
              />
            </Tooltip>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)' }}>目标文件夹</label>
            <PathPicker value={dst} onChange={onDstChange} placeholder="选择目标文件夹..." disabled={running} />
          </div>
        </div>
      </SectionCard>

      {/* 冲突策略 */}
      <SectionCard title="冲突处理策略">
        <div style={{ display: 'flex', gap: 10 }}>
          {([
            { value: 'overwrite' as const, label: '直接覆盖', desc: '目标文件存在时直接用源文件覆盖' },
            { value: 'skip' as const, label: '跳过', desc: '目标文件存在时保留原文件不作修改' },
            { value: 'ask' as const, label: '询问', desc: '目标文件存在时弹窗让用户逐一决定' },
          ]).map((opt) => {
            const active = conflict === opt.value
            return (
              <div
                key={opt.value}
                onClick={() => !running && onConflictChange(opt.value)}
                style={{
                  flex: 1, minWidth: 0,
                  padding: '12px 14px', borderRadius: 8, cursor: running ? 'not-allowed' : 'pointer',
                  border: active ? '0.5px solid var(--color-primary)' : '0.5px solid var(--color-border-soft)',
                  backgroundColor: active ? 'var(--color-primary-mute)' : 'var(--color-background)',
                  transition: 'border-color 0.15s, background-color 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                    border: '2px solid', borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {active && <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--color-primary)' }} />}
                  </div>
                  <span style={{
                    fontSize: 13, fontWeight: 600,
                    color: active ? 'var(--color-primary)' : 'var(--color-text-1)',
                  }}>
                    {opt.label}
                    {opt.value === 'overwrite' && (
                      <Tag color="green" style={{ marginLeft: 6, fontSize: 10, padding: '0 4px' }}>默认</Tag>
                    )}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-3)', paddingLeft: 22 }}>{opt.desc}</div>
              </div>
            )
          })}
        </div>
      </SectionCard>

      {/* 其他选项 */}
      <SectionCard title="其他选项">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-2)', fontWeight: 500 }}>并发线程数</span>
            <NumberStepper value={threadCount} onChange={onThreadCountChange} min={1} max={16} disabled={running} suffix="线程" />
          </div>
          <span style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: -8 }}>推荐 2-8，过高可能降低磁盘性能</span>

          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
            padding: '10px 12px', borderRadius: 7,
            backgroundColor: 'var(--color-background)', border: '0.5px solid var(--color-border-soft)',
          }}>
            <Switch size="small" checked={recursive} onChange={onRecursiveChange} disabled={running} style={{ marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 13, color: 'var(--color-text-1)', fontWeight: 500 }}>递归同步子目录</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>包含所有子文件夹内的文件</div>
            </div>
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--color-text-2)', fontWeight: 500 }}>
              文件过滤模式
              <span style={{ color: 'var(--color-text-3)', fontWeight: 400 }}> 空则匹配全部文件</span>
            </label>
            <PatternInput value={patterns} onChange={onPatternsChange} placeholder="回车添加，如 *.go" disabled={running} />
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

// ── 预览 Tab ──
function PreviewTab({ previewing, preview }: { previewing: boolean; preview: SyncPreviewItem[] }) {
  if (previewing) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
        <Spin /><span style={{ marginLeft: 10, color: 'var(--color-text-2)' }}>扫描中...</span>
      </div>
    )
  }

  if (preview.length === 0) {
    return (
      <EmptyState
        icon={<SearchOutlined style={{ fontSize: 36, color: 'var(--color-text-3)' }} />}
        title="点击右上角「预览」开始扫描"
      />
    )
  }

  const pStats = {
    total: preview.length,
    newF: preview.filter((f) => f.status === 'new').length,
    mod: preview.filter((f) => f.status === 'modified').length,
    same: preview.filter((f) => f.status === 'identical').length,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 统计卡 */}
      <div style={{ display: 'flex', gap: 12 }}>
        {[
          { value: pStats.total, label: '共计文件', color: 'var(--color-text-1)' },
          { value: pStats.newF, label: '新增文件', color: 'var(--color-primary)' },
          { value: pStats.mod, label: '已修改', color: 'var(--color-warning)' },
          { value: pStats.same, label: '相同（跳过）', color: 'var(--color-text-3)' },
        ].map((s) => (
          <div key={s.label} style={{
            flex: 1, minWidth: 100,
            backgroundColor: 'var(--color-background-soft)',
            border: '0.5px solid var(--color-border)',
            borderRadius: 10, padding: '12px 16px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color, marginBottom: 3 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 文件列表 */}
      <SectionCard title={`文件列表（${pStats.newF + pStats.mod} 个待同步）`}>
        <Table
          dataSource={preview}
          rowKey="relativePath"
          size="small"
          pagination={{ pageSize: 24, showSizeChanger: true, pageSizeOptions: ['20', '50', '100', '200'], showTotal: (total) => `共 ${total} 条` }}
          style={{ fontSize: 12, height: "calc(100vh - 320px)", overflowY: "auto"}}
          columns={[
            {
              title: '相对路径',
              dataIndex: 'relativePath',
              key: 'path',
              ellipsis: { showTitle: false },
              render: (path: string) => (
                  <span style={{ fontFamily: 'var(--code-font-family)' }}>{path}</span>
              ),
            },
            {
              title: '大小',
              dataIndex: 'size',
              key: 'size',
              width: 80,
              align: 'right',
              render: (size: number) => <span style={{ color: 'var(--color-text-3)' }}>{formatBytes(size)}</span>,
            },
            {
              title: '状态',
              dataIndex: 'status',
              key: 'status',
              width: 88,
              align: 'center',
              render: (status: SyncFileStatus) => <SyncStatusTag status={status} />,
            },
          ]}
        />
      </SectionCard>
    </div>
  )
}

// ── 进度 Tab ──
function ProgressTab({ fileProgress, running, result, progDone, progSync, progSkip, progErr, progTotal, progPct }: {
  fileProgress: Record<string, FileProgress>
  running: boolean
  result: SyncResult | null
  progDone: number; progSync: number; progSkip: number; progErr: number; progTotal: number; progPct: number
}) {
  const progItems = Object.entries(fileProgress)

  if (progItems.length === 0 && !running) {
    return (
      <EmptyState
        icon={<ThunderboltOutlined style={{ fontSize: 36, color: 'var(--color-text-3)' }} />}
        title="尚未开始同步"
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 总进度 */}
      <ProgressPanel
        current={progDone}
        total={progTotal}
        status={running ? 'syncing' : result ? (result.cancelled ? 'cancelled' : 'done') : 'pending'}
        title={result ? (result.cancelled ? '已取消' : '同步完成') : '同步中...'}
        extra={
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
            {result && <Tag style={{ margin: 0 }}>{`耗时 ${result.duration}`}</Tag>}
            {result && <Tag color="green" style={{ margin: 0 }}>{`同步量 ${formatBytes(result.totalSize)}`}</Tag>}
          </div>
        }
      />

      {/* 统计药丸 */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <StatPill color="var(--color-primary)" label={`已同步 ${progDone}`} />
        {progSync > 0 && <StatPill color="var(--color-warning)" label={`同步中 ${progSync}`} />}
        <StatPill color="var(--color-text-3)" label={`已跳过 ${progSkip}`} />
        {progErr > 0 && <StatPill color="var(--color-error)" label={`错误 ${progErr}`} />}
      </div>

      {/* 文件明细 */}
      <SectionCard title="文件明细">
        {progItems.map(([rel, info]) => (
          <FileProgressRow key={rel} relativePath={rel} info={info} />
        ))}
      </SectionCard>
    </div>
  )
}

// ── 文件进度行 ──
function FileProgressRow({ relativePath, info }: {
  relativePath: string
  info: FileProgress
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: '8px 16px',
      borderBottom: '0.5px solid var(--color-border-soft)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {info.status === 'syncing' && <ReloadOutlined spin style={{ color: 'var(--color-primary)' }} />}
        <span style={{
          flex: 1, fontSize: 12,
          color: info.status === 'pending' ? 'var(--color-text-3)' : 'var(--color-text-1)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontFamily: 'var(--code-font-family)',
        }}>
          {relativePath}
        </span>
        <span style={{ fontSize: 11, color: 'var(--color-text-3)', flexShrink: 0 }}>{formatBytes(info.totalBytes)}</span>
        <SyncStatusTag status={info.status} />
      </div>
      {info.error && <div style={{ paddingLeft: 21, fontSize: 11, color: 'var(--color-error)' }}>{info.error}</div>}
    </div>
  )
}

// ── 同步状态标签 ──
function SyncStatusTag({ status }: { status: SyncFileStatus }) {
  const MAP: Record<SyncFileStatus, { color: string; label: string }> = {
    new: { color: 'success', label: '新增' },
    modified: { color: 'warning', label: '已修改' },
    identical: { color: 'default', label: '相同' },
    pending: { color: 'default', label: '等待' },
    syncing: { color: 'processing', label: '同步中' },
    synced: { color: 'success', label: '已同步' },
    skipped: { color: 'default', label: '跳过' },
    error: { color: 'error', label: '错误' },
  }
  const cfg = MAP[status]
  return <Tag color={cfg.color} style={{ margin: 0, width: 56, textAlign: 'center' }}>{cfg.label}</Tag>
}

// ── 统计药丸 ──
function StatPill({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: color }} />
      <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{label}</span>
    </div>
  )
}
