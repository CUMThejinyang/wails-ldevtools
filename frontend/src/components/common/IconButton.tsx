import { Tooltip } from 'antd'
import { forwardRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface Props {
  icon: ReactNode
  tooltip?: string
  danger?: boolean
  disabled?: boolean
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  size?: number
  className?: string
  style?: React.CSSProperties
}

const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { icon, tooltip, danger, disabled, onClick, size = 28, className, style }, ref,
) {
  const btn = (
    <button
      ref={ref}
      type="button"
      className={cn('btn-icon-base', className)}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: size, height: size,
        borderRadius: 6, border: 'none', background: 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: danger ? 'var(--color-text-3)' : 'var(--color-text-2)',
        transition: 'background-color 0.15s, color 0.15s, transform 0.1s',
        ...style,
      }}
      onMouseEnter={(e) => {
        if (disabled) return
        e.currentTarget.style.backgroundColor = danger ? 'rgba(255, 77, 80, 0.12)' : 'var(--color-hover)'
        if (danger) e.currentTarget.style.color = 'var(--color-error)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent'
        e.currentTarget.style.color = danger ? 'var(--color-text-3)' : 'var(--color-text-2)'
      }}
    >
      {icon}
    </button>
  )
  return tooltip ? <Tooltip title={tooltip}>{btn}</Tooltip> : btn
})

export default IconButton
