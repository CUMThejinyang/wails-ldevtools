import { useState, useEffect, useCallback } from 'react'
import { bridge } from '../hooks/bridge'
import Tooltip from './Tooltip'

/* ── macOS 红绿灯按钮颜色 ── */
const COLORS = {
  close: '#ff5f57',
  min:   '#febc2e',
  max:   '#28c840',
} as const

const DIM = '#444'

export default function TitleBar() {
  const [isMaximised, setIsMaximised] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null)

  useEffect(() => {
    const check = async () => {
      try {
        const m = await bridge.windowIsMaximised()
        setIsMaximised(m)
      } catch {}
    }
    check()
    const timer = setInterval(check, 800)
    return () => clearInterval(timer)
  }, [])

  const handleDoubleClick = useCallback(async () => {
    await bridge.windowToggleMaximise()
    const m = await bridge.windowIsMaximised()
    setIsMaximised(m)
  }, [])

  const togglePin = useCallback(async () => {
    try {
      if (isPinned) {
        await bridge.windowSetAlwaysOnTop(false)
      } else {
        await bridge.windowSetAlwaysOnTop(true)
      }
      setIsPinned(!isPinned)
    } catch {}
  }, [isPinned])

  return (
    <div style={styles.bar}>
      {/* 拖拽区域 + 双击最大化 */}
      <div style={styles.drag} onDoubleClick={handleDoubleClick}
        onMouseDown={(e) => { (e.currentTarget as HTMLElement).style.cursor = 'grabbing' }}
        onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.cursor = 'grab' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.cursor = 'grab' }}
      >
        <span style={styles.title}>DevTools</span>
      </div>

      {/* 右侧按钮组 */}
      <div style={styles.controls}>
        {/* 置顶 */}
        <Tooltip text={isPinned ? '取消置顶' : '置顶'}>
          <button
            className="btn-pin"
            onClick={togglePin}
            onMouseEnter={() => setHoveredBtn('pin')}
            onMouseLeave={() => setHoveredBtn(null)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isPinned ? 'var(--color-primary)' : (hoveredBtn === 'pin' ? 'var(--color-text-2)' : 'var(--color-text-3)')} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="17" x2="12" y2="22" />
              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
            </svg>
          </button>
        </Tooltip>

        <div style={styles.separator} />

        {/* 最小化 */}
        <Tooltip text="最小化">
          <button
            style={dotStyle('min', hoveredBtn === 'min')}
            onMouseEnter={() => setHoveredBtn('min')}
            onMouseLeave={() => setHoveredBtn(null)}
            onClick={() => bridge.windowMinimise()}
          />
        </Tooltip>

        {/* 最大化 / 还原 */}
        <Tooltip text={isMaximised ? '还原' : '最大化'}>
          <button
            style={dotStyle('max', hoveredBtn === 'max')}
            onMouseEnter={() => setHoveredBtn('max')}
            onMouseLeave={() => setHoveredBtn(null)}
            onClick={async () => {
              await bridge.windowToggleMaximise()
              const m = await bridge.windowIsMaximised()
              setIsMaximised(m)
            }}
          />
        </Tooltip>

        {/* 关闭 */}
        <Tooltip text="关闭">
          <button
            style={dotStyle('close', hoveredBtn === 'close')}
            onMouseEnter={() => setHoveredBtn('close')}
            onMouseLeave={() => setHoveredBtn(null)}
            onClick={() => bridge.windowClose()}
          />
        </Tooltip>
      </div>
    </div>
  )
}

function dotStyle(id: keyof typeof COLORS, hovered: boolean): React.CSSProperties {
  return {
    width: 16,
    height: 16,
    borderRadius: '50%',
    border: 'none',
    backgroundColor: hovered ? COLORS[id] : DIM,
    cursor: 'pointer',
    transition: 'background-color 0.15s',
    flexShrink: 0,
    padding: 0,
  }
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    height: 40,
    minHeight: 40,
    backgroundColor: 'var(--navbar-bg)',
    borderBottom: '0.5px solid var(--color-border)',
    flexShrink: 0,
    userSelect: 'none',
    WebkitUserSelect: 'none',
  },
  drag: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    paddingLeft: 14,
    height: '100%',
    cursor: 'grab',
    '--wails-draggable': 'drag',
  } as React.CSSProperties,
  title: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-text-3)',
    letterSpacing: '0.05em',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    height: '100%',
    paddingLeft: 8,
    paddingRight: 14,
  },
  separator: {
    width: 1,
    height: 16,
    backgroundColor: 'var(--color-border)',
    margin: '0 2px',
  },
}
