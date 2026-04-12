import { useState, useEffect, useCallback, useRef } from 'react'
import { bridge, onEvent, formatBytes } from '../../hooks/bridge'
import Tooltip from '../../components/Tooltip'
import type { FolderConfig, CleanerSettings, CleanProgress, OverallResult } from '../../types'

const DEFAULT_SETTINGS: CleanerSettings = {
  folders: [],
  threadCount: 4,
}

type ProgressMap = Record<string, CleanProgress>

// ── SVG 图标（避免依赖字体）──
const Ico = {
  Trash:   () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>,
  Plus:    () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Folder:  () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  Play:    () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  Stop:    () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>,
  X:       () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Chevron: ({ up }: { up?: boolean }) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points={up ? "18 15 12 9 6 15" : "6 9 12 15 18 9"}/></svg>,
  Check:   () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Alert:   () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  Spin:    () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 0.8s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>,
  Info:    () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
}

export default function CleanerPage() {
  const [settings, setSettings] = useState<CleanerSettings>(DEFAULT_SETTINGS)
  const [progress, setProgress] = useState<ProgressMap>({})
  const [result, setResult] = useState<OverallResult | null>(null)
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(true)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<'config' | 'progress' | 'result'>('config')
  // 添加文件夹弹窗
  const [showAddModal, setShowAddModal] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bridge.getCleanerSettings()
      .then((s) => setSettings(s))
      .catch(() => {})
      .finally(() => setLoading(false))
    bridge.isCleanRunning().then(setRunning).catch(() => {})

    const offP = onEvent('cleaner:progress', (data) => {
      const p = data as CleanProgress
      setProgress((prev) => ({ ...prev, [p.folderId]: p }))
      setTimeout(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
      }, 0)
    })
    const offC = onEvent('cleaner:completed', (data) => {
      setResult(data as OverallResult)
      setRunning(false)
      setActiveTab('result')
    })
    return () => { offP(); offC() }
  }, [])

  const save = useCallback(async (s: CleanerSettings) => {
    setSettings(s)
    try { await bridge.saveCleanerSettings(s) } catch {}
  }, [])

  const addFolder = (folder: FolderConfig) => {
    save({ ...settings, folders: [...settings.folders, folder] })
  }

  const removeFolder = (id: string) =>
    save({ ...settings, folders: settings.folders.filter((f) => f.id !== id) })

  const toggleFolder = (id: string) =>
    save({ ...settings, folders: settings.folders.map((f) => f.id === id ? { ...f, enabled: !f.enabled } : f) })

  const updateFolder = (id: string, patch: Partial<FolderConfig>) =>
    save({ ...settings, folders: settings.folders.map((f) => f.id === id ? { ...f, ...patch } : f) })

  const startClean = async () => {
    setProgress({})
    setResult(null)
    setRunning(true)
    setActiveTab('progress')
    try { await bridge.startClean(settings) }
    catch (e) { setRunning(false); alert(String(e)) }
  }

  const toggleExpand = (id: string) =>
    setExpandedFolders((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  if (loading) return (
    <div style={styles.center}><Ico.Spin /></div>
  )

  const enabledCount = settings.folders.filter((f) => f.enabled).length

  return (
    <div style={styles.page}>
      {/* 添加文件夹弹窗 */}
      {showAddModal && (
        <AddFolderModal
          onConfirm={addFolder}
          onCancel={() => setShowAddModal(false)}
        />
      )}

      {/* 标题栏 */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={{ color: 'var(--color-primary)', display: 'flex' }}><Ico.Trash /></span>
          <span style={styles.title}>文件夹清理</span>
          {enabledCount > 0 && <span style={styles.badge}>{enabledCount} 个</span>}
        </div>
        <div style={styles.headerRight}>
          <button style={styles.btnDefault} onClick={() => setShowAddModal(true)}>
            <Ico.Plus />添加文件夹
          </button>
          {!running
            ? <button
                style={{ ...styles.btnPrimary, ...(enabledCount === 0 ? styles.btnDisabled : {}) }}
                onClick={startClean} disabled={enabledCount === 0}
              ><Ico.Play />开始清理</button>
            : <button style={styles.btnDanger} onClick={() => bridge.stopClean()}>
                <Ico.Stop />停止
              </button>
          }
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {(['config', 'progress', 'result'] as const).map((tab) => (
          <button key={tab}
            style={{ ...styles.tab, ...(activeTab === tab ? styles.tabActive : {}) }}
            onClick={() => setActiveTab(tab)}
          >
            {{ config: '📁 文件夹配置', progress: `⚡ 清理进度${running ? ' ●' : ''}`, result: '📊 清理结果' }[tab]}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div style={styles.content}>

        {/* ══ 配置 ══ */}
        {activeTab === 'config' && (
          <div style={styles.tabContent}>
            {/* 线程数 */}
            <div style={styles.section}>
              <div style={styles.sectionTitle}><Ico.Info /> 全局设置</div>
              <div style={styles.settingsRow}>
                <label style={styles.label}>并发线程数</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input type="range" min={1} max={16} step={1}
                    value={settings.threadCount}
                    onChange={(e) => save({ ...settings, threadCount: Number(e.target.value) })}
                    style={{ flex: 1, accentColor: 'var(--color-primary)' }}
                  />
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-primary)', minWidth: 20, textAlign: 'center' }}>
                    {settings.threadCount}
                  </span>
                </div>
                <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>推荐 2-8，过高可能降低磁盘性能</span>
              </div>
            </div>

            {/* 文件夹列表 */}
            <div style={styles.section}>
              <div style={styles.sectionTitle}><Ico.Folder /> 文件夹列表</div>
              {settings.folders.length === 0
                ? <div style={styles.empty}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🗑️</div>
                    <div style={{ color: 'var(--color-text-2)' }}>还没有添加文件夹</div>
                    <div style={{ color: 'var(--color-text-3)', fontSize: 12, marginTop: 4 }}>
                      点击右上角「添加文件夹」开始配置
                    </div>
                  </div>
                : settings.folders.map((folder) => (
                    <FolderCard key={folder.id} folder={folder}
                      expanded={expandedFolders.has(folder.id)}
                      onToggleExpand={() => toggleExpand(folder.id)}
                      onToggleEnabled={() => toggleFolder(folder.id)}
                      onUpdate={(p) => updateFolder(folder.id, p)}
                      onRemove={() => removeFolder(folder.id)}
                    />
                  ))
              }
            </div>
          </div>
        )}

        {/* ══ 进度 ══ */}
        {activeTab === 'progress' && (
          <div style={styles.tabContent}>
            {Object.keys(progress).length === 0 && !running
              ? <div style={styles.empty}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>⚡</div>
                  <div style={{ color: 'var(--color-text-2)' }}>尚未开始清理</div>
                </div>
              : <div ref={logRef} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {settings.folders.filter((f) => f.enabled).map((folder) => (
                    <ProgressCard key={folder.id} folder={folder} progress={progress[folder.id]} />
                  ))}
                </div>
            }
          </div>
        )}

        {/* ══ 结果 ══ */}
        {activeTab === 'result' && (
          <div style={styles.tabContent}>
            {!result
              ? <div style={styles.empty}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                  <div style={{ color: 'var(--color-text-2)' }}>暂无清理结果</div>
                </div>
              : <ResultPanel result={result} />
            }
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
//  AddFolderModal - 添加文件夹弹窗（支持浏览+手动输入）
// ─────────────────────────────────────────────
function AddFolderModal({ onConfirm, onCancel }: {
  onConfirm: (f: FolderConfig) => void
  onCancel: () => void
}) {
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [patterns, setPatterns] = useState('')
  const [recursive, setRecursive] = useState(true)
  const [deleteEmptyDirs, setDeleteEmptyDirs] = useState(true)
  const [deleteFolder, setDeleteFolder] = useState(true)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // 更新路径时自动填充名称
  const handlePathChange = (v: string) => {
    setPath(v)
    setError('')
    if (!name || name === path.split(/[/\\]/).pop()) {
      const auto = v.split(/[/\\]/).pop() || ''
      if (auto) setName(auto)
    }
  }

  // 浏览选择
  const browse = async () => {
    try {
      const selected = await bridge.selectDirectory()
      if (selected) handlePathChange(selected)
    } catch {}
  }

  const confirm = () => {
    if (!path.trim()) { setError('请输入或选择文件夹路径'); return }
    onConfirm({
      id: generateId(),
      name: name.trim() || path.split(/[/\\]/).pop() || path,
      path: path.trim(),
      patterns: patterns.split(',').map((p) => p.trim()).filter(Boolean),
      recursive,
      deleteEmptyDirs,
      deleteFolder,
      enabled: true,
    })
    // 添加成功后重置表单，方便继续添加
    setPath('')
    setName('')
    setPatterns('')
    setRecursive(true)
    setDeleteEmptyDirs(true)
    setDeleteFolder(true)
    setError('')
    inputRef.current?.focus()
  }

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div style={modal}>
        <div style={modalHeader}>
          <span style={{ fontWeight: 600, color: 'var(--color-text-1)' }}>添加文件夹</span>
          <button style={closeBtn} onClick={onCancel}><Ico.X /></button>
        </div>

        <div style={modalBody}>
          {/* 路径输入行 */}
          <div style={formRow}>
            <label style={formLabel}>文件夹路径 <span style={{ color: 'var(--color-error)' }}>*</span></label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                ref={inputRef}
                style={{ ...inputStyle, flex: 1, ...(error ? { borderColor: 'var(--color-error)' } : {}) }}
                placeholder="C:\Users\... 或直接点击浏览"
                value={path}
                onChange={(e) => handlePathChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirm()}
                autoFocus
              />
              <button style={browseBtn} onClick={browse}>
                <Ico.Folder /> 浏览
              </button>
            </div>
            {error && <div style={{ color: 'var(--color-error)', fontSize: 12 }}>{error}</div>}
          </div>

          {/* 显示名称 */}
          <div style={formRow}>
            <label style={formLabel}>显示名称（可选）</label>
            <input
              style={inputStyle}
              placeholder="留空则使用文件夹名"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* 文件匹配 */}
          <div style={formRow}>
            <label style={formLabel}>
              文件模式（可选）
              <span style={{ color: 'var(--color-text-3)', fontWeight: 400 }}> 逗号分隔，空=全部文件</span>
            </label>
            <input
              style={inputStyle}
              placeholder="*.log, *.tmp, *.cache"
              value={patterns}
              onChange={(e) => setPatterns(e.target.value)}
            />
          </div>

          {/* 选项 */}
          <div style={formRow}>
            <label style={formLabel}>清理选项</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <CheckRow
                label="递归删除子目录内的文件"
                desc="进入所有子目录执行删除"
                checked={recursive}
                onChange={setRecursive}
              />
              <CheckRow
                label="删除空文件夹"
                desc="文件删除后清理空目录"
                checked={deleteEmptyDirs}
                onChange={setDeleteEmptyDirs}
              />
              <CheckRow
                label="删除该文件夹本身"
                desc="清理完成后删除配置的根文件夹"
                checked={deleteFolder}
                onChange={setDeleteFolder}
                highlight
              />
            </div>
          </div>
        </div>

        <div style={modalFooter}>
          <button style={styles.btnDefault} onClick={onCancel}>取消</button>
          <button style={styles.btnPrimary} onClick={confirm}>
            <Ico.Plus /> 添加
          </button>
        </div>
      </div>
    </div>
  )
}

function CheckRow({ label, desc, checked, onChange, highlight }: {
  label: string; desc: string; checked: boolean; onChange: (v: boolean) => void; highlight?: boolean
}) {
  return (
    <label style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
      padding: '8px 10px', borderRadius: 7,
      backgroundColor: checked && highlight ? 'rgba(255,77,80,0.07)' : 'var(--color-background-mute)',
      border: `0.5px solid ${checked && highlight ? 'rgba(255,77,80,0.3)' : 'var(--color-border-soft)'}`,
      transition: 'background-color 0.15s',
    }}>
      <input
        type="checkbox" checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: highlight ? 'var(--color-error)' : 'var(--color-primary)', marginTop: 2, flexShrink: 0 }}
      />
      <div>
        <div style={{ fontSize: 13, color: highlight ? (checked ? 'var(--color-error)' : 'var(--color-text-2)') : 'var(--color-text-1)', fontWeight: 500 }}>
          {label}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 1 }}>{desc}</div>
      </div>
    </label>
  )
}

// ─────────────────────────────────────────────
//  FolderCard
// ─────────────────────────────────────────────
function FolderCard({ folder, expanded, onToggleExpand, onToggleEnabled, onUpdate, onRemove }: {
  folder: FolderConfig; expanded: boolean
  onToggleExpand: () => void; onToggleEnabled: () => void
  onUpdate: (p: Partial<FolderConfig>) => void; onRemove: () => void
}) {
  const [patternsText, setPatternsText] = useState(folder.patterns.join(', '))

  const handlePatternsBlur = () =>
    onUpdate({ patterns: patternsText.split(',').map((p) => p.trim()).filter(Boolean) })

  return (
    <div style={{ ...styles.card, ...(!folder.enabled ? styles.cardDisabled : {}) }}>
      <div style={styles.cardHeader}>
        <button style={styles.expandBtn} onClick={onToggleExpand}>
          <Ico.Chevron up={expanded} />
        </button>
        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={onToggleExpand}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {folder.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {folder.path}
          </div>
        </div>
        {/* 标签 */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
          {folder.recursive && <Tag label="递归" />}
          {folder.deleteEmptyDirs && <Tag label="空目录" />}
          {folder.deleteFolder && <Tag label="删文件夹" color="rgba(255,77,80,0.15)" textColor="var(--color-error)" />}
        </div>
        <div style={{ display: 'flex', gap: 2, alignItems: 'center', flexShrink: 0 }}>
          {/* 启用开关 */}
          <Tooltip text={folder.enabled ? '禁用' : '启用'}>
            <button
              onClick={onToggleEnabled}
              style={{
                ...styles.iconBtn,
                color: folder.enabled ? 'var(--color-primary)' : 'var(--color-text-3)',
                backgroundColor: folder.enabled ? 'var(--color-primary-mute)' : 'transparent',
              }}
            >
              <Ico.Check />
            </button>
          </Tooltip>
          <Tooltip text="删除">
            <button
              onClick={onRemove}
              style={{ ...styles.iconBtn, color: 'var(--color-text-3)' }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--color-error)')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--color-text-3)')}
            >
              <Ico.X />
            </button>
          </Tooltip>
        </div>
      </div>

      {expanded && (
        <div style={styles.cardBody}>
          <div style={formRow}>
            <label style={formLabel}>显示名称</label>
            <input style={inputStyle} value={folder.name}
              onChange={(e) => onUpdate({ name: e.target.value })} />
          </div>
          <div style={formRow}>
            <label style={formLabel}>文件模式（逗号分隔，空=全部）</label>
            <input style={inputStyle} value={patternsText}
              onChange={(e) => setPatternsText(e.target.value)}
              onBlur={handlePatternsBlur}
              placeholder="*.log, *.tmp" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <CheckRow label="递归删除子目录" desc="进入所有子目录"
              checked={folder.recursive} onChange={(v) => onUpdate({ recursive: v })} />
            <CheckRow label="删除空文件夹" desc="清理后移除空目录"
              checked={folder.deleteEmptyDirs} onChange={(v) => onUpdate({ deleteEmptyDirs: v })} />
            <CheckRow label="删除该文件夹本身" desc="清理完成后删除根目录"
              checked={folder.deleteFolder} onChange={(v) => onUpdate({ deleteFolder: v })} highlight />
          </div>
        </div>
      )}
    </div>
  )
}

function Tag({ label, color = 'var(--color-primary-mute)', textColor = 'var(--color-primary)' }: {
  label: string; color?: string; textColor?: string
}) {
  return (
    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, backgroundColor: color, color: textColor, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

// ─────────────────────────────────────────────
//  ProgressCard
// ─────────────────────────────────────────────
function ProgressCard({ folder, progress }: { folder: FolderConfig; progress?: CleanProgress }) {
  const status = progress?.status ?? 'pending'
  const deleted = progress?.deletedFiles ?? 0
  const size = progress?.deletedSize ?? 0
  const total = progress?.totalFiles ?? 0
  const pct = total > 0 ? Math.min(100, Math.round((deleted / total) * 100)) : 0

  const colorMap: Record<string, string> = {
    scanning: 'var(--color-warning)',
    deleting: 'var(--color-primary)',
    done: 'var(--color-success)',
    error: 'var(--color-error)',
    cancelled: 'var(--color-text-3)',
    pending: 'var(--color-text-3)',
  }
  const labelMap: Record<string, string> = {
    scanning: '扫描中', deleting: '删除中', done: '完成',
    error: '错误', cancelled: '已取消', pending: '等待中',
  }
  const statusColor = colorMap[status] ?? 'var(--color-text-3)'

  return (
    <div style={styles.progressCard}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          {(status === 'scanning' || status === 'deleting') && (
            <span style={{ color: statusColor, flexShrink: 0 }}><Ico.Spin /></span>
          )}
          {status === 'done' && <span style={{ color: statusColor, flexShrink: 0 }}><Ico.Check /></span>}
          {status === 'error' && <span style={{ color: statusColor, flexShrink: 0 }}><Ico.Alert /></span>}
          {(status === 'pending' || status === 'cancelled') && <div style={{ width: 14, flexShrink: 0 }} />}
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {folder.name}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
          <span style={{ color: statusColor, fontSize: 12 }}>{labelMap[status] ?? status}</span>
          <span style={{ color: 'var(--color-text-2)', fontSize: 12 }}>
            {deleted} 个 / {formatBytes(size)}
          </span>
        </div>
      </div>
      {(status === 'deleting' || status === 'scanning' || (status === 'done' && total > 0)) && (
        <div style={{ height: 3, backgroundColor: 'var(--color-background-mute)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 2, width: `${pct}%`, backgroundColor: statusColor, transition: 'width 0.3s ease' }} />
        </div>
      )}
      {progress?.currentFile && status === 'deleting' && (
        <div style={{ fontSize: 11, color: 'var(--color-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {progress.currentFile}
        </div>
      )}
      {progress?.error && <div style={{ fontSize: 12, color: 'var(--color-error)' }}>{progress.error}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────
//  ResultPanel
// ─────────────────────────────────────────────
function ResultPanel({ result }: { result: OverallResult }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { v: String(result.totalDeleted), l: '删除文件数' },
          { v: formatBytes(result.totalSize), l: '释放空间' },
          { v: result.duration, l: '总耗时' },
          ...(result.cancelled ? [{ v: '已取消', l: '状态' }] : []),
        ].map((s) => (
          <div key={s.l} style={{ flex: 1, minWidth: 110, backgroundColor: 'var(--color-background-soft)', border: '0.5px solid var(--color-border)', borderRadius: 10, padding: '14px 18px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-primary)', marginBottom: 4 }}>{s.v}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={styles.section}>
        <div style={styles.sectionTitle}><Ico.Folder /> 各文件夹</div>
        {result.results?.map((r) => (
          <div key={r.folderId} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-soft)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.folderName}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.path}</div>
              {r.error && <div style={{ fontSize: 12, color: 'var(--color-error)' }}>{r.error}</div>}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ color: 'var(--color-text-1)', fontSize: 13 }}>{r.deletedFiles} 个</div>
              <div style={{ color: 'var(--color-text-3)', fontSize: 12 }}>{formatBytes(r.deletedSize)}</div>
              <div style={{ color: 'var(--color-text-3)', fontSize: 11 }}>{r.duration}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 弹窗样式 ──
const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0,
  backgroundColor: 'rgba(0,0,0,0.55)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000,
}
const modal: React.CSSProperties = {
  backgroundColor: 'var(--color-background-soft)',
  border: '0.5px solid var(--color-border)',
  borderRadius: 12,
  width: 480, maxWidth: '92vw',
  boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
  display: 'flex', flexDirection: 'column',
  maxHeight: '85vh', overflow: 'hidden',
}
const modalHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '14px 18px',
  borderBottom: '0.5px solid var(--color-border)',
  flexShrink: 0,
}
const modalBody: React.CSSProperties = {
  padding: '16px 18px',
  display: 'flex', flexDirection: 'column', gap: 14,
  overflow: 'auto',
}
const modalFooter: React.CSSProperties = {
  display: 'flex', justifyContent: 'flex-end', gap: 8,
  padding: '12px 18px',
  borderTop: '0.5px solid var(--color-border)',
  flexShrink: 0,
}
const closeBtn: React.CSSProperties = {
  width: 26, height: 26, borderRadius: '50%',
  border: 'none', backgroundColor: 'transparent',
  color: 'var(--color-text-3)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const formRow: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }
const formLabel: React.CSSProperties = { fontSize: 12, color: 'var(--color-text-2)', fontWeight: 500 }
const inputStyle: React.CSSProperties = {
  padding: '7px 10px',
  backgroundColor: 'var(--color-background)',
  border: '0.5px solid var(--color-border)',
  borderRadius: 7,
  color: 'var(--color-text-1)',
  fontSize: 13,
  outline: 'none',
  width: '100%',
  userSelect: 'text',
  WebkitUserSelect: 'text',
}
const browseBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 5,
  padding: '7px 12px', borderRadius: 7,
  border: '0.5px solid var(--color-border)',
  backgroundColor: 'var(--color-background-mute)',
  color: 'var(--color-text-2)',
  cursor: 'pointer', fontSize: 13, flexShrink: 0,
  whiteSpace: 'nowrap',
}

// ── 页面样式 ──
const styles: Record<string, React.CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 20px', height: 52, minHeight: 52,
    borderBottom: '0.5px solid var(--color-border)',
    backgroundColor: 'var(--color-background-soft)', flexShrink: 0,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: 600, color: 'var(--color-text-1)' },
  badge: { fontSize: 11, color: 'var(--color-primary)', backgroundColor: 'var(--color-primary-mute)', padding: '2px 8px', borderRadius: 20 },
  tabs: {
    display: 'flex', gap: 2, padding: '8px 20px 0',
    backgroundColor: 'var(--color-background-soft)',
    borderBottom: '0.5px solid var(--color-border)', flexShrink: 0,
  },
  tab: {
    padding: '6px 14px', fontSize: 13,
    color: 'var(--color-text-2)', backgroundColor: 'transparent',
    border: 'none', borderBottom: '2px solid transparent',
    cursor: 'pointer', marginBottom: -1, transition: 'color 0.15s',
  },
  tabActive: { color: 'var(--color-primary)', borderBottomColor: 'var(--color-primary)' },
  content: { flex: 1, overflow: 'auto', padding: 20 },
  tabContent: { display: 'flex', flexDirection: 'column', gap: 20 },
  section: { backgroundColor: 'var(--color-background-soft)', borderRadius: 10, border: '0.5px solid var(--color-border)', overflow: 'hidden' },
  sectionTitle: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '9px 16px', fontSize: 11, color: 'var(--color-text-3)',
    borderBottom: '0.5px solid var(--color-border)',
    backgroundColor: 'var(--color-background-mute)',
    fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  settingsRow: { padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 },
  label: { fontSize: 13, color: 'var(--color-text-2)', fontWeight: 500 },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 20px' },
  // 卡片
  card: { borderBottom: '0.5px solid var(--color-border-soft)', transition: 'opacity 0.2s' },
  cardDisabled: { opacity: 0.42 },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' },
  expandBtn: { width: 22, height: 22, border: 'none', backgroundColor: 'transparent', color: 'var(--color-text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, flexShrink: 0 },
  cardBody: { padding: '4px 12px 14px 42px', display: 'flex', flexDirection: 'column', gap: 10, backgroundColor: 'var(--color-background)' },
  iconBtn: {
    width: 28, height: 28, border: 'none', backgroundColor: 'transparent',
    cursor: 'pointer', borderRadius: 6,
    display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.15s',
  },
  // 进度卡
  progressCard: { backgroundColor: 'var(--color-background-soft)', border: '0.5px solid var(--color-border)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 },
  // 按钮
  btnPrimary: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 7, backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500 },
  btnDefault: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 7, backgroundColor: 'transparent', border: '0.5px solid var(--color-border)', color: 'var(--color-text-2)', cursor: 'pointer', fontSize: 13 },
  btnDanger: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 7, backgroundColor: 'var(--color-error)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500 },
  btnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
}

function generateId() { return Math.random().toString(36).slice(2, 11) }
