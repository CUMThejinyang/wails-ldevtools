import { useState, useEffect, useCallback } from 'react'
import { Tooltip } from 'antd'
import { bridge } from '@/services/bridge'
import { PinIcon } from '@/icons'

const DOT_COLORS = { close: '#ff5f57', min: '#febc2e', max: '#28c840' } as const
const DIM = '#444'

export default function TitleBar() {
  const [isMaximised, setIsMaximised] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null)
  const [isDraggingTitle, setIsDraggingTitle] = useState(false)

  useEffect(() => {
    const check = async () => {
      try { setIsMaximised(await bridge.windowIsMaximised()) } catch { /* ignore */ }
    }
    check()
    const timer = setInterval(check, 800)
    return () => clearInterval(timer)
  }, [])

  const handleDoubleClick = useCallback(async () => {
    await bridge.windowToggleMaximise()
    setIsMaximised(await bridge.windowIsMaximised())
  }, [])

  const togglePin = useCallback(async () => {
    try {
      await bridge.windowSetAlwaysOnTop(!isPinned)
      setIsPinned(!isPinned)
    } catch { /* ignore */ }
  }, [isPinned])

  const handleDragStart = useCallback(() => {
    setIsDraggingTitle(true)
  }, [])

  const handleDragEnd = useCallback(() => {
    setIsDraggingTitle(false)
  }, [])

  // Wails 拖动窗口时系统接管鼠标，pointerUp 不会在标题栏触发，
  // 需要监听全局 pointerup 确保释放时重置 cursor 状态
  useEffect(() => {
    if (!isDraggingTitle) return
    const onGlobalUp = () => setIsDraggingTitle(false)
    window.addEventListener('pointerup', onGlobalUp)
    return () => window.removeEventListener('pointerup', onGlobalUp)
  }, [isDraggingTitle])

  return (
    <div style={styles.bar}>
      <div
        style={{
          ...styles.drag,
          ...(isDraggingTitle ? styles.dragActive : null),
        }}
        onDoubleClick={handleDoubleClick}
        onPointerDown={handleDragStart}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
        onMouseLeave={handleDragEnd}
      >
        <span style={styles.title}>DevTools</span>
      </div>

      <div style={styles.controls}>
        <Tooltip title={isPinned ? '取消置顶' : '置顶'} placement="bottom">
          <button
            className="btn-pin"
            style={btnPinStyle}
            onClick={togglePin}
            onMouseEnter={() => setHoveredBtn('pin')}
            onMouseLeave={() => setHoveredBtn(null)}
          >
            <PinIcon
              size={14}
              color={
                isPinned
                  ? 'var(--color-primary)'
                  : hoveredBtn === 'pin'
                    ? 'var(--color-text-2)'
                    : 'var(--color-text-3)'
              }
            />
          </button>
        </Tooltip>

        <div style={styles.separator} />

        <Tooltip title="最小化" placement="bottom">
          <button
            style={dotStyle('min', hoveredBtn === 'min')}
            onMouseEnter={() => setHoveredBtn('min')}
            onMouseLeave={() => setHoveredBtn(null)}
            onClick={() => bridge.windowMinimise()}
          />
        </Tooltip>

        <Tooltip title={isMaximised ? '还原' : '最大化'} placement="bottom">
          <button
            style={dotStyle('max', hoveredBtn === 'max')}
            onMouseEnter={() => setHoveredBtn('max')}
            onMouseLeave={() => setHoveredBtn(null)}
            onClick={async () => {
              await bridge.windowToggleMaximise()
              setIsMaximised(await bridge.windowIsMaximised())
            }}
          />
        </Tooltip>

        <Tooltip title="关闭" placement="bottom">
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

function dotStyle(id: keyof typeof DOT_COLORS, hovered: boolean): React.CSSProperties {
  return {
    width: 16,
    height: 16,
    borderRadius: '50%',
    border: 'none',
    backgroundColor: hovered ? DOT_COLORS[id] : DIM,
    cursor: 'pointer',
    transition: 'background-color 0.15s',
    flexShrink: 0,
    padding: 0,
  }
}

const btnPinStyle: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  padding: 4,
  borderRadius: 5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
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
    transition: 'background-color 0.12s ease, box-shadow 0.12s ease',
    ['--wails-draggable' as never]: 'drag',
  } as React.CSSProperties,
  dragActive: {
    cursor: 'grabbing',
    backgroundColor: 'var(--color-active)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -1px 0 rgba(0,0,0,0.22)',
  },
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
    ['--wails-draggable' as never]: 'no-drag',
  } as React.CSSProperties,
  separator: {
    width: 1,
    height: 16,
    backgroundColor: 'var(--color-border)',
    margin: '0 2px',
  },
}
