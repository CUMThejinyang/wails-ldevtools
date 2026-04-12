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
  const [controlsHovered, setControlsHovered] = useState(false)

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
      <div style={styles.drag} onDoubleClick={handleDoubleClick}>
        <span style={styles.title}>DevTools</span>
      </div>

      {/* 右侧按钮组 */}
      <div
        style={styles.controls}
        onMouseEnter={() => setControlsHovered(true)}
        onMouseLeave={() => { setControlsHovered(false); setHoveredBtn(null) }}
      >
        {/* 置顶 */}
        <Tooltip text={isPinned ? '取消置顶' : '置顶'}>
          <button
            style={styles.pinBtn}
            onClick={togglePin}
            onMouseEnter={() => setHoveredBtn('pin')}
            onMouseLeave={() => setHoveredBtn(null)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isPinned ? 'var(--color-primary)' : (hoveredBtn === 'pin' ? 'var(--color-text-2)' : 'var(--color-text-3)')} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L12 14" />
              <path d="M8 6L16 6" />
              <path d="M9 14L15 14" />
              <path d="M10 14L10 20" />
              <path d="M14 14L14 20" />
              <line x1="10" y1="20" x2="14" y2="20" />
            </svg>
          </button>
        </Tooltip>

        <div style={styles.separator} />

        {/* 最小化 */}
        <Tooltip text="最小化">
          <button
            style={dotStyle('min', controlsHovered, hoveredBtn === 'min')}
            onMouseEnter={() => setHoveredBtn('min')}
            onClick={() => bridge.windowMinimise()}
          />
        </Tooltip>

        {/* 最大化 / 还原 */}
        <Tooltip text={isMaximised ? '还原' : '最大化'}>
          <button
            style={dotStyle('max', controlsHovered, hoveredBtn === 'max')}
            onMouseEnter={() => setHoveredBtn('max')}
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
            style={dotStyle('close', controlsHovered, hoveredBtn === 'close')}
            onMouseEnter={() => setHoveredBtn('close')}
            onClick={() => bridge.windowClose()}
          />
        </Tooltip>
      </div>
    </div>
  )
}

function dotStyle(id: keyof typeof COLORS, active: boolean, hovered: boolean): React.CSSProperties {
  return {
    width: 16,
    height: 16,
    borderRadius: '50%',
    border: 'none',
    backgroundColor: active ? COLORS[id] : DIM,
    opacity: hovered ? 1 : (active ? 0.85 : 1),
    cursor: 'pointer',
    transition: 'background-color 0.15s, opacity 0.15s',
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
    cursor: 'default',
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
  pinBtn: {
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    flexShrink: 0,
    transition: 'color 0.15s',
  },
}
