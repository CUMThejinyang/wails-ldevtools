import { useState, useEffect, useCallback, useRef } from 'react'
import Editor, { loader } from '@monaco-editor/react'
import type { BeforeMount, OnMount } from '@monaco-editor/react'
import type * as MonacoNS from 'monaco-editor'
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import {
  Tabs, Button, Select, Tag, Input,
  Radio, Tooltip, Divider, Typography, Segmented, Space,
} from 'antd'
import {
  CopyOutlined, SwapOutlined, ClearOutlined,
  FileSearchOutlined, ReloadOutlined, CheckCircleOutlined,
  CodeOutlined, LockOutlined, SafetyCertificateOutlined,
  ClockCircleOutlined, SearchOutlined, BranchesOutlined, GlobalOutlined,
} from '@ant-design/icons'
import PageShell from '@/components/layout/PageShell'
import { bridge } from '@/services/bridge'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)

// ── Monaco 初始化（仅执行一次）─────────────────────────────────

self.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === 'json') return new JsonWorker()
    return new EditorWorker()
  },
}

loader.config({ monaco })

const { Text } = Typography

// ══════════════════════════════════════════════════════════════════
// 共用基础
// ══════════════════════════════════════════════════════════════════

function useIsDark() {
  const [dark, setDark] = useState(() => document.body.getAttribute('theme-mode') !== 'light')
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setDark(document.body.getAttribute('theme-mode') !== 'light')
    )
    obs.observe(document.body, { attributes: true, attributeFilter: ['theme-mode'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

function useCopy() {
  return useCallback((text: string) => {
    navigator.clipboard.writeText(text)
  }, [])
}

// ── Monaco 主题定义 ──────────────────────────────────────────────

const defineThemes: BeforeMount = (m) => {
  m.editor.defineTheme('devtools-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background':                 '#181818',
      'editorGutter.background':           '#181818',
      'editor.foreground':                 '#E8E8DF',
      'editorLineNumber.foreground':       '#444444',
      'editorLineNumber.activeForeground': '#777777',
      'editor.selectionBackground':        '#264F78',
      'editor.lineHighlightBackground':    '#1e1e1e',
      'editor.lineHighlightBorder':        '#00000000',
      'editorCursor.foreground':           '#00b96b',
      'scrollbar.shadow':                  '#00000000',
      'scrollbarSlider.background':        '#FFFFFF1E',
      'scrollbarSlider.hoverBackground':   '#FFFFFF38',
      'editorWidget.background':           '#222222',
      'editorWidget.border':               '#FFFFFF1A',
    },
  })
  m.editor.defineTheme('devtools-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background':                 '#efefef',
      'editorGutter.background':           '#efefef',
      'editorLineNumber.foreground':       '#aaaaaa',
      'editorLineNumber.activeForeground': '#666666',
      'editor.lineHighlightBackground':    '#e6e6e6',
      'editor.lineHighlightBorder':        '#00000000',
      'editorCursor.foreground':           '#00b96b',
      'scrollbar.shadow':                  '#00000000',
      'scrollbarSlider.background':        '#00000026',
      'scrollbarSlider.hoverBackground':   '#00000040',
      'editorWidget.background':           '#f0f0f0',
    },
  })
}

// ── Monaco 编辑器封装 ──────────────────────────────────────────

const BASE_OPTIONS: MonacoNS.editor.IStandaloneEditorConstructionOptions = {
  fontSize: 12,
  fontFamily: '"Fira Code","Cascadia Code","JetBrains Mono",Menlo,Consolas,monospace',
  fontLigatures: true,
  lineNumbers: 'on',
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: 'on',
  renderLineHighlight: 'line',
  padding: { top: 10, bottom: 10 },
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  overviewRulerBorder: false,
  renderWhitespace: 'none',
  folding: false,
  lineDecorationsWidth: 6,
  lineNumbersMinChars: 3,
  scrollbar: {
    vertical: 'auto',
    horizontal: 'auto',
    verticalScrollbarSize: 6,
    horizontalScrollbarSize: 6,
  },
  contextmenu: false,
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  parameterHints: { enabled: false },
  hover: { enabled: false },
}

function CodeEditor({
  value, onChange, readOnly = false,
  language, dark, placeholder, decorations,
}: {
  value: string
  onChange?: (v: string) => void
  readOnly?: boolean
  language?: 'json' | 'plaintext'
  dark: boolean
  placeholder?: string
  decorations?: MonacoNS.editor.IModelDeltaDecoration[]
}) {
  const editorRef  = useRef<MonacoNS.editor.IStandaloneCodeEditor | null>(null)
  const decoIdsRef = useRef<string[]>([])

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor
    if (decorations?.length) {
      decoIdsRef.current = editor.deltaDecorations([], decorations)
    }
  }

  // 同步外部 value（受控写入，保留光标）
  useEffect(() => {
    const ed = editorRef.current
    if (!ed) return
    if (ed.getValue() !== value) {
      const pos = ed.getPosition()
      ed.setValue(value)
      if (pos) ed.setPosition(pos)
    }
  }, [value])

  // 同步装饰器
  useEffect(() => {
    const ed = editorRef.current
    if (!ed) return
    decoIdsRef.current = ed.deltaDecorations(decoIdsRef.current, decorations ?? [])
  }, [decorations])

  return (
    <Editor
      height="100%"
      language={language ?? 'plaintext'}
      theme={dark ? 'devtools-dark' : 'devtools-light'}
      defaultValue={value}
      beforeMount={defineThemes}
      onMount={handleMount}
      onChange={(v) => onChange?.(v ?? '')}
      options={{
        ...BASE_OPTIONS,
        readOnly,
        domReadOnly: readOnly,
        placeholder,
      } as MonacoNS.editor.IStandaloneEditorConstructionOptions}
    />
  )
}

// ── 布局基础 ────────────────────────────────────────────────────

const BORDER = '0.5px solid var(--color-border)'

function PanelHeader({ label, actions }: { label: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div style={{
      flexShrink: 0, height: 32, padding: '0 12px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      borderBottom: BORDER, fontSize: 11, color: 'var(--color-text-3)',
      backgroundColor: 'var(--color-background-soft)',
      letterSpacing: '0.05em', textTransform: 'uppercase',
    }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <span style={{ display: 'flex', gap: 2 }}>{actions}</span>
    </div>
  )
}

function Toolbar({ children }: { children: React.ReactNode }) {
  return (
    <div className="codec-toolbar">{children}</div>
  )
}

function SplitLayout({
  toolbar, left, right,
}: {
  toolbar: React.ReactNode
  left: { label: React.ReactNode; actions?: React.ReactNode; content: React.ReactNode }
  right: { label: React.ReactNode; actions?: React.ReactNode; content: React.ReactNode }
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Toolbar>{toolbar}</Toolbar>
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: BORDER, minWidth: 0 }}>
          <PanelHeader label={left.label} actions={left.actions} />
          <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>{left.content}</div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          <PanelHeader label={right.label} actions={right.actions} />
          <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>{right.content}</div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// 工具 1：编码 / 解码
// ══════════════════════════════════════════════════════════════════

type EncodeMode = 'base64' | 'url' | 'html' | 'unicode'

const ENCODE_MODES: { value: EncodeMode; label: string }[] = [
  { value: 'base64',  label: 'Base64' },
  { value: 'url',     label: 'URL' },
  { value: 'html',    label: 'HTML 实体' },
  { value: 'unicode', label: 'Unicode' },
]

function encodeFn(mode: EncodeMode, urlMode: string, unicodeFmt: string) {
  return (s: string): string => {
    switch (mode) {
      case 'base64':  return btoa(unescape(encodeURIComponent(s)))
      case 'url':     return urlMode === 'component' ? encodeURIComponent(s) : encodeURI(s)
      case 'html': {
        const m: Record<string, string> = { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }
        return s.replace(/[&<>"']/g, c => m[c] ?? c)
      }
      case 'unicode':
        return s.split('').map(c => {
          const cp = c.codePointAt(0)!
          if (cp <= 127) return c
          if (unicodeFmt === 'js')   return `\\u${cp.toString(16).padStart(4,'0').toUpperCase()}`
          if (unicodeFmt === 'css')  return `\\${cp.toString(16).toUpperCase()} `
          return `&#x${cp.toString(16).toUpperCase()};`
        }).join('')
    }
  }
}

function decodeFn(mode: EncodeMode, urlMode: string) {
  return (s: string): string => {
    switch (mode) {
      case 'base64':  return decodeURIComponent(escape(atob(s.trim())))
      case 'url':     return urlMode === 'component' ? decodeURIComponent(s) : decodeURI(s)
      case 'html': {
        const div = document.createElement('div')
        div.innerHTML = s
        return div.textContent ?? ''
      }
      case 'unicode': {
        let r = s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        const div = document.createElement('div')
        div.innerHTML = r
        r = div.textContent ?? r
        return r
      }
    }
  }
}

function EncodeTool() {
  const dark = useIsDark()
  const copy = useCopy()
  const [mode, setMode]         = useState<EncodeMode>('base64')
  const [urlMode, setUrlMode]   = useState('component')
  const [unicodeFmt, setUnicodeFmt] = useState('js')
  const [input, setInput]       = useState('')
  const [output, setOutput]     = useState('')
  const [err, setErr]           = useState('')

  const run = (fn: (s: string) => string) => {
    try { setOutput(fn(input)); setErr('') }
    catch (e: unknown) { setErr(String(e)); setOutput('') }
  }

  const toolbar = (
    <>
      <Segmented
        size="small" value={mode}
        onChange={v => { setMode(v as EncodeMode); setOutput(''); setErr('') }}
        options={ENCODE_MODES}
      />
      {mode === 'url' && (
        <Radio.Group size="small" value={urlMode} onChange={e => setUrlMode(e.target.value)}>
          <Radio.Button value="component">encodeURIComponent</Radio.Button>
          <Radio.Button value="full">encodeURI</Radio.Button>
        </Radio.Group>
      )}
      {mode === 'unicode' && (
        <Radio.Group size="small" value={unicodeFmt} onChange={e => setUnicodeFmt(e.target.value)}>
          <Radio.Button value="js">\uXXXX</Radio.Button>
          <Radio.Button value="css">\XXXX</Radio.Button>
          <Radio.Button value="html">&#xXX;</Radio.Button>
        </Radio.Group>
      )}
      <Divider type="vertical" style={{ margin: '0 2px' }} />
      <Button size="small" type="primary" onClick={() => run(encodeFn(mode, urlMode, unicodeFmt))}>编码 ▶</Button>
      <Button size="small" onClick={() => run(decodeFn(mode, urlMode))}>◀ 解码</Button>
      <Button size="small" icon={<SwapOutlined />} onClick={() => { setInput(output); setOutput(''); setErr('') }} />
      <Button size="small" icon={<ClearOutlined />} onClick={() => { setInput(''); setOutput(''); setErr('') }} />
      {err && <Text type="danger" style={{ fontSize: 11, marginLeft: 4 }}>{err}</Text>}
    </>
  )

  return (
    <SplitLayout
      toolbar={toolbar}
      left={{
        label: '输入',
        actions: <Button size="small" icon={<ClearOutlined />} type="text" onClick={() => setInput('')} />,
        content: <CodeEditor value={input} onChange={setInput} dark={dark} placeholder="输入内容…" />,
      }}
      right={{
        label: '输出',
        actions: <Button size="small" icon={<CopyOutlined />} type="text" onClick={() => copy(output)}>复制</Button>,
        content: <CodeEditor value={output} readOnly dark={dark} placeholder="结果将显示在此处…" />,
      }}
    />
  )
}

// ══════════════════════════════════════════════════════════════════
// 工具 2：哈希
// ══════════════════════════════════════════════════════════════════

const ALGOS = ['MD5', 'SHA1', 'SHA256', 'SHA512'] as const
type Algo = typeof ALGOS[number]
type HashMap = Partial<Record<Algo, string>>

function formatHashResults(r: HashMap, loading: boolean): string {
  if (loading) return ALGOS.map(a => `${a.padEnd(7)}: 计算中…`).join('\n')
  return ALGOS.map(a => `${a.padEnd(7)}: ${r[a] ?? ''}`).join('\n')
}

function HashTool() {
  const dark = useIsDark()
  const copy = useCopy()
  const [hashMode, setHashMode] = useState<'text' | 'file'>('text')
  const [input, setInput]       = useState('')
  const [filePath, setFilePath] = useState('')
  const [results, setResults]   = useState<HashMap>({})
  const [loading, setLoading]   = useState(false)

  const compute = async () => {
    setLoading(true); setResults({})
    const next: HashMap = {}
    if (hashMode === 'text') {
      for (const a of ALGOS) {
        try { next[a] = await bridge.hashText(input, a.toLowerCase()) }
        catch { next[a] = '错误' }
      }
    } else {
      const p = filePath || await bridge.selectFile('选择文件').catch(() => '')
      if (!p) { setLoading(false); return }
      setFilePath(p)
      for (const a of ALGOS) {
        try { next[a] = await bridge.hashFile(p, a.toLowerCase()) }
        catch { next[a] = '错误' }
      }
    }
    setResults(next); setLoading(false)
  }

  const output = formatHashResults(results, loading)

  const toolbar = (
    <>
      <Segmented
        size="small" value={hashMode}
        onChange={v => { setHashMode(v as 'text' | 'file'); setResults({}); setFilePath('') }}
        options={[{ value: 'text', label: '文本' }, { value: 'file', label: '文件' }]}
      />
      <Divider type="vertical" style={{ margin: '0 2px' }} />
      {hashMode === 'file' && (
        <Button size="small" icon={<FileSearchOutlined />}
          onClick={async () => {
            const p = await bridge.selectFile('选择文件').catch(() => '')
            if (p) { setFilePath(p); setResults({}) }
          }}>
          选择文件
        </Button>
      )}
      <Button size="small" type="primary" loading={loading} onClick={compute}>计算</Button>
      <Button size="small" icon={<ClearOutlined />} onClick={() => { setInput(''); setFilePath(''); setResults({}) }} />
    </>
  )

  const leftContent = hashMode === 'text'
    ? <CodeEditor value={input} onChange={setInput} dark={dark} placeholder="输入要计算哈希的文本…" />
    : (
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
        {filePath
          ? <Text style={{ fontSize: 12, wordBreak: 'break-all', color: 'var(--color-text-2)' }}>{filePath}</Text>
          : <Text type="secondary" style={{ fontSize: 12 }}>点击工具栏「选择文件」按钮，或直接点击计算</Text>
        }
      </div>
    )

  return (
    <SplitLayout
      toolbar={toolbar}
      left={{ label: hashMode === 'text' ? '输入文本' : '文件路径', content: leftContent }}
      right={{
        label: '哈希结果',
        actions: Object.keys(results).length > 0
          ? <Button size="small" icon={<CopyOutlined />} type="text" onClick={() => copy(output)}>复制全部</Button>
          : undefined,
        content: <CodeEditor value={output} readOnly dark={dark} placeholder="结果将显示在此处…" />,
      }}
    />
  )
}

// ══════════════════════════════════════════════════════════════════
// 工具 3：JWT
// ══════════════════════════════════════════════════════════════════

function b64url(s: string) {
  const pad = s.replace(/-/g,'+').replace(/_/g,'/') + '=='.slice(0,(4-s.length%4)%4)
  return decodeURIComponent(escape(atob(pad)))
}

function JwtTool() {
  const dark = useIsDark()
  const copy = useCopy()
  const [token, setToken]   = useState('')
  const [output, setOutput] = useState('')
  const [err, setErr]       = useState('')

  const decode = () => {
    try {
      const [h, p] = token.trim().split('.')
      if (!h || !p) throw new Error('不是有效 JWT（需要 header.payload.signature 三段）')
      const header  = JSON.parse(b64url(h))
      const payload = JSON.parse(b64url(p))
      const exp = payload.exp ? dayjs.unix(payload.exp).format('YYYY-MM-DD HH:mm:ss') : null
      const iat = payload.iat ? dayjs.unix(payload.iat).format('YYYY-MM-DD HH:mm:ss') : null
      const nbf = payload.nbf ? dayjs.unix(payload.nbf).format('YYYY-MM-DD HH:mm:ss') : null
      const expired = payload.exp ? dayjs().unix() > payload.exp : false
      const meta = [
        exp && `// exp → ${exp}${expired ? '  ⚠ 已过期' : '  ✓ 有效'}`,
        iat && `// iat → ${iat}`,
        nbf && `// nbf → ${nbf}`,
      ].filter(Boolean).join('\n')
      setOutput([
        '// ── Header ──',
        JSON.stringify(header, null, 2),
        meta ? '\n' + meta : '',
        '\n// ── Payload ──',
        JSON.stringify(payload, null, 2),
      ].join('\n'))
      setErr('')
    } catch (e: unknown) { setErr(String(e)); setOutput('') }
  }

  const toolbar = (
    <>
      <Button size="small" type="primary" onClick={decode}>解码</Button>
      <Button size="small" icon={<ClearOutlined />} onClick={() => { setToken(''); setOutput(''); setErr('') }} />
      {err && <Text type="danger" style={{ fontSize: 11, marginLeft: 4 }}>{err}</Text>}
    </>
  )

  return (
    <SplitLayout
      toolbar={toolbar}
      left={{
        label: 'JWT Token',
        actions: <Button size="small" icon={<ClearOutlined />} type="text" onClick={() => setToken('')} />,
        content: <CodeEditor value={token} onChange={setToken} dark={dark} placeholder="粘贴 JWT token…" />,
      }}
      right={{
        label: '解码结果',
        actions: output ? <Button size="small" icon={<CopyOutlined />} type="text" onClick={() => copy(output)}>复制</Button> : undefined,
        content: <CodeEditor value={output} readOnly dark={dark} placeholder="解码后的 header / payload 将在此显示…" />,
      }}
    />
  )
}

// ══════════════════════════════════════════════════════════════════
// 工具 4：时间戳
// ══════════════════════════════════════════════════════════════════

function TimestampTool() {
  const dark = useIsDark()
  const copy = useCopy()
  const [tsInput, setTsInput]     = useState('')
  const [tz, setTz]               = useState<'local' | 'utc'>('local')
  const [dateInput, setDateInput] = useState('')
  const [output, setOutput]       = useState('')

  const runTs = () => {
    const n = Number(tsInput.trim())
    if (isNaN(n)) { setOutput('❌ 无效数字'); return }
    let d: dayjs.Dayjs
    if      (n > 1e15) d = dayjs(Math.floor(n / 1e6))
    else if (n > 1e12) d = dayjs(n)
    else if (n > 1e9)  d = dayjs.unix(n)
    else { setOutput('❌ 数值过小，无法识别单位'); return }
    const fmt = 'YYYY-MM-DD HH:mm:ss'
    const local = d.format(fmt)
    const utcStr = d.utc().format(fmt)
    setOutput(`时区: ${tz === 'utc' ? 'UTC' : '本地'}\n时间: ${tz === 'utc' ? utcStr : local}\nUTC:  ${utcStr}\n本地: ${local}`)
  }

  const runDate = () => {
    const d = dayjs(dateInput.trim())
    if (!d.isValid()) { setOutput('❌ 无效日期'); return }
    setOutput(`秒级 (s):  ${d.unix()}\n毫秒 (ms): ${d.valueOf()}\n微秒 (μs): ${d.valueOf() * 1000}\n纳秒 (ns): ${d.valueOf() * 1_000_000}`)
  }

  const now = dayjs()
  const currentStr = [
    `当前时间: ${now.format('YYYY-MM-DD HH:mm:ss')}`,
    `秒级:     ${now.unix()}`,
    `毫秒:     ${now.valueOf()}`,
  ].join('\n')

  const inputContent = (
    <div style={{ padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Text style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>当前时间</Text>
        <Space wrap size={6}>
          <Button size="small" icon={<CopyOutlined />} onClick={() => copy(String(now.unix()))}>复制秒级</Button>
          <Button size="small" icon={<CopyOutlined />} onClick={() => copy(String(now.valueOf()))}>复制毫秒</Button>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => { setTsInput(String(now.unix())); setOutput('') }}>填入时间戳</Button>
        </Space>
      </div>
      <Divider style={{ margin: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Text style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>时间戳 → 时间</Text>
        <Space wrap size={6}>
          <Input
            size="small" style={{ fontFamily: 'monospace', width: 180 }}
            value={tsInput} onChange={e => setTsInput(e.target.value)}
            onPressEnter={runTs} placeholder="秒 / 毫秒 / 纳秒"
          />
          <Radio.Group size="small" value={tz} onChange={e => setTz(e.target.value)}>
            <Radio.Button value="local">本地</Radio.Button>
            <Radio.Button value="utc">UTC</Radio.Button>
          </Radio.Group>
          <Button size="small" type="primary" onClick={runTs}>转换</Button>
        </Space>
      </div>
      <Divider style={{ margin: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Text style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>时间 → 时间戳</Text>
        <Space wrap size={6}>
          <Input
            size="small" style={{ fontFamily: 'monospace', width: 180 }}
            value={dateInput} onChange={e => setDateInput(e.target.value)}
            onPressEnter={runDate} placeholder="2024-01-01 00:00:00"
          />
          <Button size="small" type="primary" onClick={runDate}>转换</Button>
        </Space>
      </div>
    </div>
  )

  const outputVal = output || currentStr

  return (
    <SplitLayout
      toolbar={<Text style={{ fontSize: 12, color: 'var(--color-text-3)' }}>自动识别秒 / 毫秒 / 纳秒</Text>}
      left={{ label: '工具', content: inputContent }}
      right={{
        label: '结果',
        actions: <Button size="small" icon={<CopyOutlined />} type="text" onClick={() => copy(outputVal)}>复制</Button>,
        content: <CodeEditor value={outputVal} readOnly dark={dark} />,
      }}
    />
  )
}

// ══════════════════════════════════════════════════════════════════
// 工具 5：正则测试器
// ══════════════════════════════════════════════════════════════════

type MatchResult = { full: string; groups: (string | undefined)[]; index: number }

/** 字符偏移 → Monaco 行列（1-based）*/
function idxToPos(text: string, idx: number) {
  const before = text.slice(0, idx)
  const lines = before.split('\n')
  return { lineNumber: lines.length, column: lines[lines.length - 1].length + 1 }
}

function buildDecorations(text: string, results: MatchResult[]): MonacoNS.editor.IModelDeltaDecoration[] {
  return results
    .filter(r => r.full.length > 0)
    .map(r => {
      const s = idxToPos(text, r.index)
      const e = idxToPos(text, r.index + r.full.length)
      return {
        range: { startLineNumber: s.lineNumber, startColumn: s.column, endLineNumber: e.lineNumber, endColumn: e.column },
        options: { inlineClassName: 'regex-match-highlight', stickiness: 1 },
      }
    })
}

function RegexResultsPanel({ results, tested, error, dark }: {
  results: MatchResult[]
  tested: boolean
  error?: string
  dark: boolean
}) {
  const muted: React.CSSProperties = { color: 'var(--color-text-3)', fontSize: 12 }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 16 }}>
        <Text type="danger" style={{ fontSize: 12, textAlign: 'center' }}>{error}</Text>
      </div>
    )
  }
  if (!tested) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <span style={muted}>输入正则后点击「测试」</span>
      </div>
    )
  }
  if (results.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 6 }}>
        <span style={{ fontSize: 28, color: 'var(--color-text-3)' }}>∅</span>
        <span style={muted}>无匹配</span>
      </div>
    )
  }

  const cardBg = dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'
  const groupBg = dark ? 'rgba(255,195,0,0.12)' : 'rgba(160,100,0,0.08)'
  const groupColor = dark ? '#ccaa44' : '#8a5e00'
  const groupBorder = dark ? 'rgba(255,195,0,0.22)' : 'rgba(160,100,0,0.22)'

  return (
    <div style={{ overflow: 'auto', height: '100%', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
      {/* 汇总行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingBottom: 7, borderBottom: BORDER, marginBottom: 1 }}>
        <span style={{
          background: 'rgba(0,185,107,0.15)', color: '#00b96b',
          border: '1px solid rgba(0,185,107,0.3)',
          borderRadius: 4, padding: '1px 8px', fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
        }}>{results.length}</span>
        <span style={muted}>处匹配</span>
      </div>
      {/* 每条结果 */}
      {results.map((r, i) => (
        <div key={i} style={{
          padding: '7px 10px', borderRadius: 6,
          background: cardBg, border: BORDER, fontSize: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
            {/* 序号 */}
            <span style={{
              fontSize: 10, fontFamily: 'monospace', color: 'var(--color-text-3)',
              fontVariantNumeric: 'tabular-nums', minWidth: 22,
            }}>#{i + 1}</span>
            {/* 偏移 */}
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--color-text-3)' }}>@{r.index}</span>
            {/* 匹配内容 */}
            <span style={{
              background: 'rgba(0,185,107,0.18)',
              color: dark ? '#4dcc91' : '#00874d',
              border: '1px solid rgba(0,185,107,0.35)',
              borderRadius: 3, padding: '1px 6px',
              fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all',
            }}>
              {r.full === '' ? <span style={{ opacity: 0.5 }}>(空匹配)</span> : r.full}
            </span>
          </div>
          {/* 捕获组 */}
          {r.groups.some(g => g !== undefined) && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6, paddingLeft: 29 }}>
              {r.groups.map((g, j) => (
                <span key={j} style={{
                  background: groupBg, color: groupColor,
                  border: `1px solid ${groupBorder}`,
                  borderRadius: 3, padding: '0 5px',
                  fontFamily: 'monospace', fontSize: 11,
                }}>
                  ${j + 1}:&nbsp;{g ?? <span style={{ opacity: 0.45 }}>undefined</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function RegexTool() {
  const dark = useIsDark()
  const [pattern, setPattern]             = useState('')
  const [flags, setFlags]                 = useState('g')
  const [text, setText]                   = useState('')
  const [results, setResults]             = useState<MatchResult[]>([])
  const [tested, setTested]               = useState(false)
  const [err, setErr]                     = useState('')
  const [decorations, setDecorations]     = useState<MonacoNS.editor.IModelDeltaDecoration[]>([])

  const runTest = () => {
    if (!pattern) {
      setResults([]); setErr(''); setTested(false); setDecorations([])
      return
    }
    try {
      const re = new RegExp(pattern, flags)
      const matched: MatchResult[] = []
      if (flags.includes('g')) {
        let m: RegExpExecArray | null
        while ((m = re.exec(text)) !== null) {
          matched.push({ full: m[0], groups: Array.from(m).slice(1), index: m.index })
          if (m[0].length === 0) re.lastIndex++
        }
      } else {
        const m = re.exec(text)
        if (m) matched.push({ full: m[0], groups: Array.from(m).slice(1), index: m.index })
      }
      setResults(matched)
      setDecorations(buildDecorations(text, matched))
      setTested(true); setErr('')
    } catch (e: unknown) {
      setErr(String(e)); setResults([]); setDecorations([]); setTested(true)
    }
  }

  const handleTextChange = (v: string) => {
    setText(v)
    if (tested) { setDecorations([]); setTested(false) }
  }

  const clearAll = () => {
    setPattern(''); setText(''); setResults([])
    setErr(''); setTested(false); setDecorations([])
  }

  const rightLabel = !tested
    ? '匹配结果'
    : err
    ? <Text type="danger" style={{ fontSize: 11 }}>语法错误</Text>
    : results.length > 0
    ? <><CheckCircleOutlined style={{ marginRight: 4, color: '#00b96b' }} /><span style={{ color: '#00b96b', fontSize: 11 }}>共 {results.length} 处匹配</span></>
    : <span style={{ color: 'var(--color-text-3)', fontSize: 11 }}>无匹配</span>

  const toolbar = (
    <>
      <span style={{ fontFamily: 'monospace', color: 'var(--color-text-3)', fontSize: 14, lineHeight: 1 }}>/</span>
      <Input
        size="small" style={{ fontFamily: 'monospace', width: 200 }}
        value={pattern}
        onChange={e => { setPattern(e.target.value); setTested(false); setDecorations([]) }}
        onPressEnter={runTest}
        placeholder="正则表达式"
      />
      <span style={{ fontFamily: 'monospace', color: 'var(--color-text-3)', fontSize: 14, lineHeight: 1 }}>/</span>
      <Select
        size="small" value={flags} onChange={setFlags} style={{ width: 80 }}
        options={[
          { value: 'g',   label: 'g' },
          { value: 'gi',  label: 'gi' },
          { value: 'gm',  label: 'gm' },
          { value: 'gim', label: 'gim' },
          { value: 'gis', label: 'gis' },
          { value: '',    label: '(无)' },
        ]}
      />
      <Button size="small" type="primary" onClick={runTest}>测试</Button>
      <Button size="small" icon={<ClearOutlined />} onClick={clearAll} />
      {err && (
        <Text type="danger" style={{ fontSize: 11, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {err}
        </Text>
      )}
    </>
  )

  return (
    <SplitLayout
      toolbar={toolbar}
      left={{
        label: '测试文本',
        actions: <Button size="small" icon={<ClearOutlined />} type="text" onClick={() => { setText(''); setDecorations([]); setTested(false) }} />,
        content: <CodeEditor value={text} onChange={handleTextChange} dark={dark} placeholder="输入要测试的文本…" decorations={decorations} />,
      }}
      right={{
        label: rightLabel,
        content: <RegexResultsPanel results={results} tested={tested} error={err} dark={dark} />,
      }}
    />
  )
}

// ══════════════════════════════════════════════════════════════════
// 工具 6：JSON 工具
// ══════════════════════════════════════════════════════════════════

function deepUnescape(s: string): string {
  // 递归展开：string value 能 JSON.parse 成 object/array 就替换，多层也处理
  function tryExpand(v: unknown): unknown {
    if (typeof v === 'string') {
      try {
        const inner = JSON.parse(v)
        // 只展开 object/array，避免把 "123" 变成数字
        if (inner !== null && typeof inner === 'object') return tryExpand(inner)
      } catch { /* 不是 JSON，原样保留 */ }
      return v
    }
    if (Array.isArray(v)) return v.map(tryExpand)
    if (v !== null && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, tryExpand(val)])
      )
    }
    return v
  }

  let cur = s.trim()
  // 先处理"整体是多层转义字符串"的情况
  for (let i = 0; i < 12; i++) {
    try {
      const parsed = JSON.parse(cur)
      if (typeof parsed === 'string') { cur = parsed; continue }
      // object/array：递归展开内部的 string value
      return JSON.stringify(tryExpand(parsed), null, 2)
    } catch { break }
  }
  return cur
}

function JsonTool() {
  const dark = useIsDark()
  const copy = useCopy()
  const [input, setInput]   = useState('')
  const [output, setOutput] = useState('')
  const [err, setErr]       = useState('')

  const run = (fn: () => string) => {
    try { setOutput(fn()); setErr('') }
    catch (e: unknown) { setErr(String(e)); setOutput('') }
  }

  const toolbar = (
    <>
      <Button size="small" type="primary" onClick={() => run(() => JSON.stringify(JSON.parse(input), null, 2))}>格式化</Button>
      <Button size="small" onClick={() => run(() => JSON.stringify(JSON.parse(input)))}>压缩</Button>
      <Button size="small" onClick={() => run(() => {
        // 把 JSON 中 object/array 类型的 value 转成 JSON 字符串，primitive 不变
        const obj = JSON.parse(input)
        function stringify(v: unknown): unknown {
          if (v === null || typeof v !== 'object') return v
          if (Array.isArray(v)) return JSON.stringify(v)
          return JSON.stringify(
            Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, stringify(val)]))
          )
        }
        return JSON.stringify(stringify(obj), null, 2)
      })}>转义字符串</Button>
      <Tooltip title="递归 JSON.parse，还原多层转义的字符串">
        <Button size="small" onClick={() => run(() => deepUnescape(input))}>深层去转义</Button>
      </Tooltip>
      <Divider type="vertical" style={{ margin: '0 2px' }} />
      <Button size="small" icon={<SwapOutlined />} onClick={() => { setInput(output); setOutput(''); setErr('') }} />
      <Button size="small" icon={<ClearOutlined />} onClick={() => { setInput(''); setOutput(''); setErr('') }} />
      {err && <Text type="danger" style={{ fontSize: 11, marginLeft: 4 }}>{err}</Text>}
    </>
  )

  return (
    <SplitLayout
      toolbar={toolbar}
      left={{
        label: '输入',
        actions: <Button size="small" icon={<ClearOutlined />} type="text" onClick={() => setInput('')} />,
        content: <CodeEditor value={input} onChange={setInput} language="json" dark={dark} placeholder='粘贴 JSON 或多层转义字符串…' />,
      }}
      right={{
        label: '输出',
        actions: output ? <Button size="small" icon={<CopyOutlined />} type="text" onClick={() => copy(output)}>复制</Button> : undefined,
        content: <CodeEditor value={output} readOnly language="json" dark={dark} placeholder="结果将显示在此处…" />,
      }}
    />
  )
}

// ══════════════════════════════════════════════════════════════════
// 工具 7：网络地址
// ══════════════════════════════════════════════════════════════════

type NetType = 'ipv4' | 'ipv6' | 'mac'
type MacSep = ':' | '-' | 'dot' | 'none'

function randByte() { return Math.floor(Math.random() * 256) }
function randU16()  { return Math.floor(Math.random() * 65536) }

function genOne(type: NetType, opts: { v6compress: boolean; macSep: MacSep }): string {
  if (type === 'ipv4') return Array.from({ length: 4 }, randByte).join('.')
  if (type === 'ipv6') {
    const g = Array.from({ length: 8 }, () => randU16().toString(16).padStart(4, '0'))
    const full = g.join(':')
    if (!opts.v6compress) return full
    return full.replace(/(?:^|:)(?:0+:){2,}/, '::').replace(/::.*::/, '::')
  }
  const bytes = Array.from({ length: 6 }, () => randByte().toString(16).padStart(2, '0'))
  const { macSep } = opts
  if (macSep === 'dot')  return `${bytes.slice(0,2).join('')}.${bytes.slice(2,4).join('')}.${bytes.slice(4,6).join('')}`
  if (macSep === 'none') return bytes.join('')
  return bytes.join(macSep)
}

function formatMAC(raw: string, sep: MacSep): string {
  const hex = raw.replace(/[:\-.\s]/g, '').toLowerCase()
  if (hex.length !== 12 || !/^[0-9a-f]+$/.test(hex)) return '❌ 无效 MAC 地址'
  const bytes = Array.from({ length: 6 }, (_, i) => hex.slice(i*2, i*2+2))
  if (sep === 'dot')  return `${hex.slice(0,4)}.${hex.slice(4,8)}.${hex.slice(8,12)}`
  if (sep === 'none') return hex
  return bytes.join(sep)
}

function NetworkTool() {
  const dark = useIsDark()
  const copy = useCopy()
  const [type, setType]         = useState<NetType>('ipv4')
  const [count, setCount]       = useState(10)
  const [v6compress, setV6compress] = useState(false)
  const [macSep, setMacSep]     = useState<MacSep>(':')
  const [output, setOutput]     = useState('')
  const [macInput, setMacInput] = useState('')
  const [macFmt, setMacFmt]     = useState('')

  const generate = () => {
    const lines = Array.from({ length: count }, () => genOne(type, { v6compress, macSep }))
    setOutput(lines.join('\n'))
  }

  const leftContent = (
    <div style={{ padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Text style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>随机生成</Text>
        <Space wrap size={6}>
          <Segmented
            size="small" value={type}
            onChange={v => { setType(v as NetType); setOutput('') }}
            options={[
              { value: 'ipv4', label: 'IPv4' },
              { value: 'ipv6', label: 'IPv6' },
              { value: 'mac',  label: 'MAC' },
            ]}
          />
          <Select
            size="small" value={count} onChange={setCount} style={{ width: 80 }}
            options={[1,5,10,20,50,100].map(n => ({ value: n, label: `${n} 条` }))}
          />
          {type === 'ipv6' && (
            <Radio.Group size="small" value={v6compress} onChange={e => setV6compress(e.target.value)}>
              <Radio.Button value={false}>完整</Radio.Button>
              <Radio.Button value={true}>压缩</Radio.Button>
            </Radio.Group>
          )}
          {type === 'mac' && (
            <Select
              size="small" value={macSep} onChange={setMacSep} style={{ width: 140 }}
              options={[
                { value: ':',    label: 'AA:BB:CC' },
                { value: '-',    label: 'AA-BB-CC' },
                { value: 'dot',  label: 'AABB.CCDD' },
                { value: 'none', label: 'AABBCCDDFFEE' },
              ]}
            />
          )}
          <Button size="small" type="primary" icon={<ReloadOutlined />} onClick={generate}>生成</Button>
        </Space>
      </div>
      <Divider style={{ margin: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Text style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>MAC 格式转换</Text>
        <Input
          size="small" style={{ fontFamily: 'monospace' }}
          value={macInput} onChange={e => { setMacInput(e.target.value); setMacFmt('') }}
          placeholder="任意格式 MAC，如 AA:BB:CC:DD:EE:FF"
          onPressEnter={() => setMacFmt(formatMAC(macInput, macSep))}
        />
        <Space size={6}>
          <Select
            size="small" value={macSep} onChange={setMacSep} style={{ width: 180 }}
            options={[
              { value: ':',    label: 'AA:BB:CC:DD:EE:FF' },
              { value: '-',    label: 'AA-BB-CC-DD-EE-FF' },
              { value: 'dot',  label: 'AABB.CCDD.EEFF' },
              { value: 'none', label: 'AABBCCDDEEFF' },
            ]}
          />
          <Button size="small" type="primary" onClick={() => setMacFmt(formatMAC(macInput, macSep))}>转换</Button>
        </Space>
        {macFmt && (
          <Space size={6}>
            <Input size="small" readOnly value={macFmt} style={{ fontFamily: 'monospace', fontSize: 12 }} />
            <Button size="small" icon={<CopyOutlined />} onClick={() => copy(macFmt)} />
          </Space>
        )}
      </div>
    </div>
  )

  return (
    <SplitLayout
      toolbar={<Text style={{ fontSize: 12, color: 'var(--color-text-3)' }}>IPv4 / IPv6 / MAC 随机生成与格式转换</Text>}
      left={{ label: '配置', content: leftContent }}
      right={{
        label: `生成结果${output ? `（${output.split('\n').length} 条）` : ''}`,
        actions: output ? <Button size="small" icon={<CopyOutlined />} type="text" onClick={() => copy(output)}>复制全部</Button> : undefined,
        content: <CodeEditor value={output} readOnly dark={dark} placeholder="点击「生成」按钮…" />,
      }}
    />
  )
}

// ══════════════════════════════════════════════════════════════════
// 主页面
// ══════════════════════════════════════════════════════════════════

const TABS = [
  { key: 'encode',    label: '编码 / 解码', icon: <CodeOutlined />,                children: <EncodeTool /> },
  { key: 'hash',      label: '哈希计算',    icon: <LockOutlined />,                 children: <HashTool /> },
  { key: 'jwt',       label: 'JWT 解码',    icon: <SafetyCertificateOutlined />,    children: <JwtTool /> },
  { key: 'timestamp', label: '时间戳',      icon: <ClockCircleOutlined />,          children: <TimestampTool /> },
  { key: 'regex',     label: '正则测试',    icon: <SearchOutlined />,               children: <RegexTool /> },
  { key: 'json',      label: 'JSON 工具',   icon: <BranchesOutlined />,             children: <JsonTool /> },
  { key: 'network',   label: '网络地址',    icon: <GlobalOutlined />,               children: <NetworkTool /> },
]

export default function CodecPage() {
  return (
    <PageShell title="编码工具箱">
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex' }}>
        <Tabs
          className="codec-tabs"
          tabPosition="left"
          size="small"
          style={{ flex: 1, overflow: 'hidden' }}
          items={TABS.map(t => ({
            key: t.key,
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                {t.icon}
                {t.label}
              </span>
            ),
            children: t.children,
          }))}
        />
      </div>
    </PageShell>
  )
}
