import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  align?: 'left' | 'right' | 'space-between'
  gap?: number
  style?: React.CSSProperties
}

export default function Toolbar({ children, align = 'left', gap = 8, style }: Props) {
  const justifyContent =
    align === 'right' ? 'flex-end' : align === 'space-between' ? 'space-between' : 'flex-start'
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap,
        justifyContent,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
