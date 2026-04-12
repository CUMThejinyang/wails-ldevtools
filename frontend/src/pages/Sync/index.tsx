import { useState, useEffect, useCallback, useRef } from 'react'
import Tooltip from '../../components/Tooltip'
import { bridge, onEvent, formatBytes } from '../../hooks/bridge'
import type { ConflictMode, SyncPreviewItem, SyncFileStatus } from '../../types'

// ── 图标 ──
const Ico = {
  Sync:   () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>,
  Folder: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  Play:   () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  Stop:   () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>,
  Eye:    () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  Swap:   () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 16V4m0 0L3 8m4-4 4 4"/><path d="M17 8v12m0 0 4-4m-4 4-4-4"/></svg>,
  Check:  () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Skip:   () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="15 8 19 12 15 16"/></svg>,
  Equal:  () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="9" x2="19" y2="9"/><line x1="5" y1="15" x2="19" y2="15"/></svg>,
  Edit:   () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>,
  New:    () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Alert:  () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  Spin:   () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="anim-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>,
  File:   () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  X:      () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
}

type TabId = 'config' | 'preview' | 'progress'

interface ProgressMap {
  [rel: string]: {
    status: SyncFileStatus
    bytesCopied: number
    totalBytes: number
    error?: string
  }
}

interface ConflictReq {
  relativePath: string
  srcPath: string
  dstPath: string
  srcSize: number
  dstSize: number
}

interface SyncResult {
  synced: number
  skipped: number
  errors: number
  totalSize: number
  duration: string
  cancelled: boolean
}

export default function SyncPage() {
  const [tab, setTab]               = useState<TabId>('config')
  const [src, setSrc]               = useState('')
  const [dst, setDst]               = useState('')
  const [conflict, setConflict]     = useState<ConflictMode>('overwrite')
  const [recursive, setRecursive]   = useState(true)
  const [patterns, setPatterns]     = useState('')
  const [threadCount, setThreadCount] = useState(4)
  const [running, setRunning]       = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview]       = useState<SyncPreviewItem[]>([])
  const [progress, setProgress]     = useState<ProgressMap>({})
  const [result, setResult]         = useState<SyncResult | null>(null)
  const [conflictReq, setConflictReq] = useState<ConflictReq | null>(null)
  // 全局冲突决策：设置后对后续冲突自动应答，不再弹窗
  const autoDecision = useRef<string | null>(null)

  // 加载已保存配置
  useEffect(() => {
    bridge.getSyncConfig().then(cfg => {
      setSrc(cfg.src || '')
      setDst(cfg.dst || '')
      setConflict(cfg.conflict || 'overwrite')
      setRecursive(cfg.recursive !== false)
      setPatterns((cfg.patterns || []).join(', '))
      setThreadCount(cfg.threadCount || 4)
    }).catch(() => {})

    bridge.isSyncRunning().then(r => {
      if (r) { setRunning(true); setTab('progress') }
    }).catch(() => {})

    const offP = onEvent('sync:progress', (data: unknown) => {
      const p = data as { relativePath: string; status: SyncFileStatus; bytesCopied: number; totalBytes: number; error?: string }
      setProgress(prev => ({ ...prev, [p.relativePath]: { status: p.status, bytesCopied: p.bytesCopied, totalBytes: p.totalBytes, error: p.error } }))
    })
    const offC = onEvent('sync:completed', (data: unknown) => {
      setResult(data as SyncResult)
      setRunning(false)
      setTab('progress')
    })
    const offK = onEvent('sync:conflict', (data: unknown) => {
      const req = data as ConflictReq
      if (autoDecision.current) {
        bridge.resolveSyncConflict(autoDecision.current).catch(() => {})
      } else {
        setConflictReq(req)
      }
    })
    return () => { offP(); offC(); offK() }
  }, [])

  const currentConfig = useCallback(() => ({
    src, dst, conflict, recursive, threadCount,
    patterns: patterns.split(',').map(p => p.trim()).filter(Boolean),
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
    } catch (e) { alert(String(e)) }
    finally { setPreviewing(false) }
  }

  const doStart = async () => {
    const cfg = saveAndGet()
    if (!cfg.src || !cfg.dst) return
    setProgress({})
    setResult(null)
    autoDecision.current = null
    setRunning(true)
    setTab('progress')
    try { await bridge.startSync(cfg) }
    catch (e) { setRunning(false); alert(String(e)) }
  }

  const doStop = () => bridge.stopSync().catch(() => {})

  const resolveConflict = (decision: string, applyAll: boolean) => {
    if (applyAll) autoDecision.current = decision
    setConflictReq(null)
    bridge.resolveSyncConflict(decision).catch(() => {})
  }

  const swapPaths = () => {
    setSrc(dst)
    setDst(src)
  }

  const browseSrc = async () => {
    try { const p = await bridge.selectDirectory(); if (p) setSrc(p) } catch {}
  }
  const browseDst = async () => {
    try { const p = await bridge.selectDirectory(); if (p) setDst(p) } catch {}
  }

  // 预览统计
  const pStats = {
    total: preview.length,
    newF:  preview.filter(f => f.status === 'new').length,
    mod:   preview.filter(f => f.status === 'modified').length,
    same:  preview.filter(f => f.status === 'identical').length,
  }

  // 进度统计
  const progItems    = Object.entries(progress)
  const progDone     = progItems.filter(([,v]) => v.status === 'synced').length
  const progSkip     = progItems.filter(([,v]) => v.status === 'skipped').length
  const progIdent    = progItems.filter(([,v]) => v.status === 'identical').length
  const progErr      = progItems.filter(([,v]) => v.status === 'error').length
  const progSync     = progItems.filter(([,v]) => v.status === 'syncing').length
  const progTotal    = progItems.filter(([,v]) => v.status !== 'skipped' && v.status !== 'identical').length
  const progPct   = progTotal > 0 ? Math.min(100, Math.round((progDone / progTotal) * 100)) : 0

  return (
    <div style={s.page}>

      {/* 冲突弹窗 */}
      {conflictReq && (
        <ConflictModal
          req={conflictReq}
          onResolve={resolveConflict}
        />
      )}

      {/* 页面头部 */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <span style={{ color: 'var(--color-primary)', display: 'flex' }}><Ico.Sync /></span>
          <span style={s.title}>文件夹同步</span>
        </div>
        <div style={s.headerRight}>
          <button className="btn btn-default" onClick={doPreview} disabled={!src || !dst || running}>
            <Ico.Eye />预览
          </button>
          {!running
            ? <button className="btn btn-primary" onClick={doStart} disabled={!src || !dst}>
                <Ico.Play />开始同步
              </button>
            : <button className="btn btn-danger" onClick={doStop}>
                <Ico.Stop />停止
              </button>
          }
        </div>
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        {([
          ['config',   '⚙️ 配置'],
          ['preview',  `🔍 预览${preview.length > 0 ? ` (${preview.length})` : ''}`],
          ['progress', `⚡ 同步进度${running ? ' ●' : ''}`],
        ] as [TabId, string][]).map(([id, label]) => (
          <button key={id} className={`btn-tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div style={s.content}>

        {/* ══ 配置 ══ */}
        {tab === 'config' && (
          <div style={s.tabContent}>

            {/* 路径选择 */}
            <div style={s.card}>
              <div style={s.cardTitle}><Ico.Folder /> 同步路径</div>
              <div style={s.folderArea}>
                {/* 源 */}
                <div style={s.folderBox}>
                  <div style={s.folderLabel}>源文件夹</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input style={s.input} value={src} onChange={e => setSrc(e.target.value)} placeholder="选择源文件夹..." />
                    <button className="btn-browse" onClick={browseSrc}><Ico.Folder />浏览</button>
                  </div>
                  {src && <div style={s.pathHint}>{src}</div>}
                </div>

                {/* 互换按钮 */}
                <div style={s.swapCol}>
                  <Tooltip text="互换路径" placement="top">
                    <button className="btn-icon" style={s.swapBtn} onClick={swapPaths}>
                      <Ico.Swap />
                    </button>
                  </Tooltip>
                </div>

                {/* 目标 */}
                <div style={s.folderBox}>
                  <div style={s.folderLabel}>目标文件夹</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input style={s.input} value={dst} onChange={e => setDst(e.target.value)} placeholder="选择目标文件夹..." />
                    <button className="btn-browse" onClick={browseDst}><Ico.Folder />浏览</button>
                  </div>
                  {dst && <div style={s.pathHint}>{dst}</div>}
                </div>
              </div>
            </div>

            {/* 冲突策略 */}
            <div style={s.card}>
              <div style={s.cardTitle}>⚡ 冲突处理策略</div>
              <div style={s.cardBody}>
                <div style={s.conflictRow}>
                  {([
                    ['overwrite', '直接覆盖', '目标文件存在时直接用源文件覆盖'] as const,
                    ['skip',      '跳过',     '目标文件存在时保留原文件不作修改'] as const,
                    ['ask',       '询问',     '目标文件存在时弹窗让用户逐一决定'] as const,
                  ]).map(([val, label, desc]) => (
                    <label
                      key={val}
                      style={{ ...s.conflictOption, ...(conflict === val ? s.conflictOptionActive : {}) }}
                      onClick={() => setConflict(val)}
                    >
                      <div style={{ ...s.radio, ...(conflict === val ? s.radioActive : {}) }}>
                        {conflict === val && <div style={s.radioDot} />}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: conflict === val ? 'var(--color-primary)' : 'var(--color-text-1)', marginBottom: 2 }}>
                          {label}
                          {val === 'overwrite' && <span style={s.defaultBadge}>默认</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* 其他选项 */}
            <div style={s.card}>
              <div style={s.cardTitle}>🔧 其他选项</div>
              <div style={s.cardBody}>
                {/* 线程数 */}
                <div style={s.settingsRow}>
                  <label style={s.label}>并发线程数</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input type="range" min={1} max={16} step={1}
                      value={threadCount}
                      onChange={e => setThreadCount(Number(e.target.value))}
                      style={{ flex: 1, accentColor: 'var(--color-primary)' }}
                    />
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-primary)', minWidth: 20, textAlign: 'center' }}>
                      {threadCount}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>推荐 2-8，过高可能降低磁盘性能</span>
                </div>

                <label style={s.checkRow}>
                  <input type="checkbox" checked={recursive} onChange={e => setRecursive(e.target.checked)} style={{ accentColor: 'var(--color-primary)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--color-text-1)', fontWeight: 500 }}>递归同步子目录</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>包含所有子文件夹内的文件</div>
                  </div>
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, color: 'var(--color-text-2)', fontWeight: 500 }}>
                    文件过滤模式
                    <span style={{ color: 'var(--color-text-3)', fontWeight: 400 }}> 逗号分隔，空=全部文件</span>
                  </label>
                  <input style={s.input} value={patterns} onChange={e => setPatterns(e.target.value)} placeholder="*.go, *.tsx, *.json" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ 预览 ══ */}
        {tab === 'preview' && (
          <div style={s.tabContent}>
            {previewing
              ? <div style={s.center}><Ico.Spin /><span style={{ marginLeft: 10, color: 'var(--color-text-2)' }}>扫描中...</span></div>
              : preview.length === 0
                ? <div style={s.empty}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                    <div style={{ color: 'var(--color-text-2)' }}>点击右上角「预览」开始扫描</div>
                  </div>
                : <>
                    {/* 统计卡 */}
                    <div style={s.statsRow}>
                      <StatCard value={pStats.total} label="共计文件"       color="var(--color-text-1)" />
                      <StatCard value={pStats.newF}  label="新增文件"       color="var(--color-primary)" />
                      <StatCard value={pStats.mod}   label="已修改"         color="var(--color-warning)" />
                      <StatCard value={pStats.same}  label="相同（跳过）"   color="var(--color-text-3)" />
                    </div>
                    {/* 文件列表 */}
                    <div style={s.card}>
                      <div style={s.cardTitle}><Ico.File /> 文件列表（{pStats.newF + pStats.mod} 个待同步）</div>
                      <div style={s.listHeader}>
                        <span style={{ flex: 1 }}>相对路径</span>
                        <span style={{ width: 80, textAlign: 'right' }}>大小</span>
                        <span style={{ width: 88, textAlign: 'center' }}>状态</span>
                      </div>
                      {preview.map((f, i) => <PreviewRow key={i} item={f} />)}
                    </div>
                  </>
            }
          </div>
        )}

        {/* ══ 进度 ══ */}
        {tab === 'progress' && (
          <div style={s.tabContent}>
            {progItems.length === 0 && !running
              ? <div style={s.empty}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>⚡</div>
                  <div style={{ color: 'var(--color-text-2)' }}>尚未开始同步</div>
                </div>
              : <>
                  {/* 总进度 */}
                  <div style={s.progressHeader}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-1)' }}>
                        {result ? (result.cancelled ? '已取消' : '同步完成') : '同步中...'}
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--color-primary)', fontWeight: 700 }}>
                        {progDone} / {progTotal}
                        <span style={{ color: 'var(--color-text-3)', fontWeight: 400, marginLeft: 6 }}>{progPct}%</span>
                      </span>
                    </div>
                    <div style={s.progressTrack}>
                      <div style={{ ...s.progressBar, width: `${progPct}%` }} />
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
                      <StatPill color="var(--color-primary)" label={`已同步 ${progDone}`} />
                      {progSync > 0 && <StatPill color="var(--color-warning)" label={`同步中 ${progSync}`} />}
                      <StatPill color="#7eb8da"              label={`内容相同 ${progIdent}`} />
                      <StatPill color="var(--color-text-3)"  label={`已跳过 ${progSkip}`} />
                      {progErr  > 0 && <StatPill color="var(--color-error)" label={`错误 ${progErr}`} />}
                      {result && <StatPill color="var(--color-text-3)" label={`耗时 ${result.duration}`} />}
                      {result && <StatPill color="var(--color-primary)" label={`同步量 ${formatBytes(result.totalSize)}`} />}
                    </div>
                  </div>

                  {/* 文件明细 */}
                  <div style={s.card}>
                    <div style={s.cardTitle}><Ico.File /> 文件明细</div>
                    {progItems.map(([rel, info]) => (
                      <ProgressRow key={rel} relativePath={rel} info={info} />
                    ))}
                  </div>
                </>
            }
          </div>
        )}
      </div>
    </div>
  )
}

// ── 冲突弹窗 ──
function ConflictModal({ req, onResolve }: {
  req: ConflictReq
  onResolve: (decision: string, applyAll: boolean) => void
}) {
  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={modalHeader}>
          <span style={{ fontWeight: 600, color: 'var(--color-text-1)' }}>⚠️ 文件冲突</span>
        </div>
        <div style={modalBody}>
          <div style={{ fontSize: 12, color: 'var(--color-text-2)', marginBottom: 8 }}>目标路径已存在同名文件：</div>
          <div style={{ fontSize: 12, fontFamily: 'var(--code-font-family)', color: 'var(--color-text-1)', backgroundColor: 'var(--color-background-mute)', padding: '6px 10px', borderRadius: 6, wordBreak: 'break-all', marginBottom: 14 }}>
            {req.relativePath}
          </div>
          <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--color-text-3)', marginBottom: 4 }}>
            <span>源文件大小：<b style={{ color: 'var(--color-text-2)' }}>{formatBytes(req.srcSize)}</b></span>
            <span>目标文件大小：<b style={{ color: 'var(--color-text-2)' }}>{formatBytes(req.dstSize)}</b></span>
          </div>
        </div>
        <div style={modalFooter}>
          <button className="btn btn-default" onClick={() => onResolve('skip', false)}>跳过</button>
          <button className="btn btn-default" onClick={() => onResolve('skip', true)}>全部跳过</button>
          <button className="btn btn-primary" onClick={() => onResolve('overwrite', false)}>覆盖</button>
          <button className="btn btn-primary" onClick={() => onResolve('overwrite', true)}>全部覆盖</button>
        </div>
      </div>
    </div>
  )
}

// ── 预览行 ──
function PreviewRow({ item }: { item: SyncPreviewItem }) {
  const cfg = statusCfg(item.status)
  return (
    <div style={s.fileRow}>
      <span style={{ color: cfg.color, flexShrink: 0, display: 'flex' }}>{cfg.icon}</span>
      <Tooltip text={item.relativePath} placement="top">
        <span style={{ flex: 1, fontSize: 12, color: 'var(--color-text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--code-font-family)' }}>
          {item.relativePath}
        </span>
      </Tooltip>
      <span style={{ width: 80, textAlign: 'right', fontSize: 11, color: 'var(--color-text-3)', flexShrink: 0 }}>
        {formatBytes(item.size)}
      </span>
      <span style={{ width: 88, textAlign: 'center', flexShrink: 0 }}>
        <span style={{ ...s.badge, backgroundColor: cfg.bg, color: cfg.color }}>{cfg.label}</span>
      </span>
    </div>
  )
}

// ── 进度行 ──
function ProgressRow({ relativePath, info }: {
  relativePath: string
  info: { status: SyncFileStatus; bytesCopied: number; totalBytes: number; error?: string }
}) {
  const cfg = statusCfg(info.status)
  const pct = info.totalBytes > 0 ? Math.min(100, Math.round((info.bytesCopied / info.totalBytes) * 100)) : 0
  return (
    <div style={{ ...s.fileRow, flexDirection: 'column', gap: 4, alignItems: 'stretch' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: cfg.color, flexShrink: 0, display: 'flex' }}>
          {info.status === 'syncing' ? <Ico.Spin /> : cfg.icon}
        </span>
        <span style={{ flex: 1, fontSize: 12, color: info.status === 'pending' ? 'var(--color-text-3)' : 'var(--color-text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--code-font-family)' }}>
          {relativePath}
        </span>
        <span style={{ fontSize: 11, color: 'var(--color-text-3)', flexShrink: 0 }}>
          {formatBytes(info.totalBytes)}
        </span>
        <span style={{ ...s.badge, backgroundColor: cfg.bg, color: cfg.color, width: 56, textAlign: 'center', flexShrink: 0 }}>
          {cfg.label}
        </span>
      </div>
      {info.status === 'syncing' && (
        <div style={{ paddingLeft: 21 }}>
          <div style={{ height: 2, backgroundColor: 'var(--color-background-mute)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, backgroundColor: 'var(--color-primary)', borderRadius: 2, transition: 'width 0.2s' }} />
          </div>
        </div>
      )}
      {info.error && (
        <div style={{ paddingLeft: 21, fontSize: 11, color: 'var(--color-error)' }}>{info.error}</div>
      )}
    </div>
  )
}

function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ flex: 1, minWidth: 100, backgroundColor: 'var(--color-background-soft)', border: '0.5px solid var(--color-border)', borderRadius: 10, padding: '12px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginBottom: 3 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{label}</div>
    </div>
  )
}

function StatPill({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: color }} />
      <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{label}</span>
    </div>
  )
}

// ── 状态配置 ──
function statusCfg(status: SyncFileStatus) {
  switch (status) {
    case 'new':       return { icon: <Ico.New />,   label: '新增',   color: 'var(--color-primary)', bg: 'var(--color-primary-mute)' }
    case 'modified':  return { icon: <Ico.Edit />,  label: '已修改', color: 'var(--color-warning)', bg: 'rgba(250,173,20,0.12)' }
    case 'identical': return { icon: <Ico.Equal />, label: '内容相同', color: '#7eb8da', bg: 'rgba(126,184,218,0.12)' }
    case 'synced':    return { icon: <Ico.Check />, label: '已同步', color: 'var(--color-primary)', bg: 'var(--color-primary-mute)' }
    case 'syncing':   return { icon: <Ico.Spin />,  label: '同步中', color: 'var(--color-primary)', bg: 'var(--color-primary-mute)' }
    case 'skipped':   return { icon: <Ico.Skip />,  label: '跳过',   color: 'var(--color-text-3)',  bg: 'var(--color-background-mute)' }
    case 'error':     return { icon: <Ico.Alert />, label: '错误',   color: 'var(--color-error)',   bg: 'rgba(255,77,80,0.12)' }
    default:          return { icon: <Ico.File />,  label: '等待',   color: 'var(--color-text-3)',  bg: 'var(--color-background-mute)' }
  }
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
  borderRadius: 12, width: 420, maxWidth: '92vw',
  boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
}
const modalHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center',
  padding: '14px 18px',
  borderBottom: '0.5px solid var(--color-border)',
}
const modalBody: React.CSSProperties = {
  padding: '16px 18px',
}
const modalFooter: React.CSSProperties = {
  display: 'flex', justifyContent: 'flex-end', gap: 8,
  padding: '12px 18px',
  borderTop: '0.5px solid var(--color-border)',
}

// ── 页面样式 ──
const s: Record<string, React.CSSProperties> = {
  page:      { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  center:    { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' },
  empty:     { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px' },

  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 20px', height: 52, minHeight: 52,
    borderBottom: '0.5px solid var(--color-border)',
    backgroundColor: 'var(--color-background-soft)', flexShrink: 0,
  },
  headerLeft:  { display: 'flex', alignItems: 'center', gap: 10 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 8 },
  title:       { fontSize: 15, fontWeight: 600, color: 'var(--color-text-1)' },

  tabs: {
    display: 'flex', gap: 2, padding: '8px 20px 0',
    backgroundColor: 'var(--color-background-soft)',
    borderBottom: '0.5px solid var(--color-border)', flexShrink: 0,
  },

  content:    { flex: 1, overflow: 'auto', padding: 20 },
  tabContent: { display: 'flex', flexDirection: 'column', gap: 16 },

  card: {
    backgroundColor: 'var(--color-background-soft)',
    border: '0.5px solid var(--color-border)',
    borderRadius: 10, overflow: 'hidden',
  },
  cardTitle: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '9px 16px', fontSize: 11, color: 'var(--color-text-3)',
    borderBottom: '0.5px solid var(--color-border)',
    backgroundColor: 'var(--color-background-mute)',
    fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  cardBody: { padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 },
  settingsRow: { display: 'flex', flexDirection: 'column', gap: 8 },
  label: { fontSize: 13, color: 'var(--color-text-2)', fontWeight: 500 },

  // 路径区
  folderArea: { display: 'flex', alignItems: 'flex-start', gap: 0, padding: 16 },
  folderBox:  { flex: 1, display: 'flex', flexDirection: 'column', gap: 8 },
  folderLabel:{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)' },
  pathHint:   { fontSize: 11, color: 'var(--color-text-3)', fontFamily: 'var(--code-font-family)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

  swapCol: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 56, flexShrink: 0, paddingTop: 24 },
  swapBtn: {
    width: 36, height: 36, borderRadius: '50%',
    backgroundColor: 'var(--color-background-mute)',
    border: '0.5px solid var(--color-border)',
    color: 'var(--color-text-2)',
  } as React.CSSProperties,

  // 冲突
  conflictRow:         { display: 'flex', gap: 10 },
  conflictOption:      { flex: 1, display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 8, cursor: 'pointer', borderWidth: 0.5, borderStyle: 'solid', borderColor: 'transparent', backgroundColor: 'var(--color-background)', transition: 'border-color 0.15s, background-color 0.15s' },
  conflictOptionActive:{ borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-primary-mute)' },
  radio:               { width: 16, height: 16, borderRadius: '50%', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2, backgroundColor: 'var(--color-background-mute)' },
  radioActive:         { backgroundColor: 'var(--color-primary-mute)' },
  radioDot:            { width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--color-primary)' },
  defaultBadge:        { marginLeft: 6, fontSize: 10, padding: '1px 5px', borderRadius: 4, backgroundColor: 'var(--color-primary-mute)', color: 'var(--color-primary)', verticalAlign: 'middle' },

  checkRow: { display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '10px 12px', borderRadius: 7, backgroundColor: 'var(--color-background)', border: '0.5px solid var(--color-border-soft)' },

  input: {
    flex: 1, padding: '7px 10px',
    backgroundColor: 'var(--color-background)',
    border: '0.5px solid var(--color-border)',
    borderRadius: 7, color: 'var(--color-text-1)',
    fontSize: 13, outline: 'none', width: '100%',
    fontFamily: 'var(--code-font-family)',
    userSelect: 'text', WebkitUserSelect: 'text',
  } as React.CSSProperties,

  statsRow: { display: 'flex', gap: 12 },

  listHeader: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 16px', fontSize: 11, color: 'var(--color-text-3)',
    borderBottom: '0.5px solid var(--color-border)',
    backgroundColor: 'var(--color-background-mute)',
    fontWeight: 600, letterSpacing: '0.04em',
  },
  fileRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 16px',
    borderBottom: '0.5px solid var(--color-border-soft)',
  },
  badge: { display: 'inline-block', fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 500, whiteSpace: 'nowrap' },

  progressHeader: { backgroundColor: 'var(--color-background-soft)', border: '0.5px solid var(--color-border)', borderRadius: 10, padding: '16px 18px' },
  progressTrack:  { height: 6, backgroundColor: 'var(--color-background-mute)', borderRadius: 3, overflow: 'hidden' },
  progressBar:    { height: '100%', backgroundColor: 'var(--color-primary)', borderRadius: 3, transition: 'width 0.3s ease' },
}
