import { useState, type ReactNode } from 'react'
import { Tooltip } from 'antd'

interface Props {
  icon: ReactNode
  label: string
  active?: boolean
  onClick?: () => void
}

export default function NavIconButton({ icon, label, active, onClick }: Props) {
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)

  const iconColor = active
    ? 'var(--color-primary)'
    : hovered
      ? 'var(--color-icon-white)'
      : 'var(--color-icon)'

  const style: React.CSSProperties = {
    width: 36,
    height: 36,
    borderRadius: '50%',
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background-color 0.15s, border-color 0.15s, opacity 0.15s, transform 0.1s',
    flexShrink: 0,
    ['--wails-draggable' as never]: 'no-drag',
  }

  if (pressed) {
    style.backgroundColor = 'var(--color-active)'
    style.transform = 'scale(0.88)'
    style.borderColor = 'var(--color-border-soft)'
  } else if (active) {
    style.backgroundColor = 'var(--color-background)'
    style.borderColor = 'var(--color-border)'
  } else if (hovered) {
    style.backgroundColor = 'var(--color-hover)'
    style.borderColor = 'var(--color-border-soft)'
    style.opacity = 0.9
  }

  return (
    <Tooltip title={label} placement="right">
      <button
        style={style}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); setPressed(false) }}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        onClick={onClick}
      >
        <span style={{ color: iconColor, display: 'flex' }}>{icon}</span>
      </button>
    </Tooltip>
  )
}
