import { useState } from 'react'
import type { PageId } from '../types'
import Tooltip from './Tooltip'

// SVG 图标（内联，避免字体依赖）
const Icons = {
  Trash: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14H6L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4h6v2"/>
    </svg>
  ),
  Settings: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  Moon: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  ),
  Sun: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  ),
}

// 导航项配置——只需在此扩展
const NAV_ITEMS: { id: PageId; icon: React.ReactNode; label: string }[] = [
  { id: 'cleaner',  icon: <Icons.Trash />,    label: '文件夹清理' },
  // { id: 'formatter', icon: ..., label: '代码格式化' },
]

interface Props {
  activePage: PageId
  onNavigate: (page: PageId) => void
  theme: string
  onToggleTheme: () => void
}

export default function Sidebar({ activePage, onNavigate, theme, onToggleTheme }: Props) {
  const [hovered, setHovered] = useState<string | null>(null)

  const iconBtnBase: React.CSSProperties = {
    width: 36,
    height: 36,
    borderRadius: '50%',
    border: '0.5px solid transparent',
    backgroundColor: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background-color 0.15s, border-color 0.15s, opacity 0.15s',
    flexShrink: 0,
    WebkitAppRegion: 'no-drag',
  } as React.CSSProperties

  const getIconBtnStyle = (id: string, isActive = false): React.CSSProperties => {
    if (isActive) return {
      ...iconBtnBase,
      backgroundColor: 'var(--color-background)',
      borderColor: 'var(--color-border)',
    }
    if (hovered === id) return {
      ...iconBtnBase,
      backgroundColor: 'rgba(255,255,255,0.1)',
      borderColor: 'var(--color-border-soft)',
      opacity: 0.9,
    }
    return iconBtnBase
  }

  const getIconColor = (id: string, isActive = false): string => {
    if (isActive) return 'var(--color-primary)'
    if (hovered === id) return 'var(--color-icon-white)'
    return 'var(--color-icon)'
  }

  return (
    <aside style={styles.container}>
      {/* Logo */}
      <div style={styles.logo}>
        <span style={styles.logoText}>D</span>
      </div>

      {/* 主导航 */}
      <nav style={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const isActive = activePage === item.id
          return (
            <Tooltip key={item.id} text={item.label} placement="right">
              <button
                style={getIconBtnStyle(item.id, isActive)}
                onMouseEnter={() => setHovered(item.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onNavigate(item.id)}
              >
                <span style={{ color: getIconColor(item.id, isActive), display: 'flex' }}>
                  {item.icon}
                </span>
              </button>
            </Tooltip>
          )
        })}
      </nav>

      {/* 底部：主题 + 设置 */}
      <div style={styles.bottom}>
        {/* 主题切换 */}
        <Tooltip text={theme === 'dark' ? '切换亮色' : '切换暗色'} placement="right">
          <button
            style={getIconBtnStyle('theme')}
            onMouseEnter={() => setHovered('theme')}
            onMouseLeave={() => setHovered(null)}
            onClick={onToggleTheme}
          >
            <span style={{ color: getIconColor('theme'), display: 'flex' }}>
              {theme === 'dark' ? <Icons.Sun /> : <Icons.Moon />}
            </span>
          </button>
        </Tooltip>

        {/* 设置页 */}
        <Tooltip text="设置" placement="right">
          <button
            style={getIconBtnStyle('settings', activePage === 'settings')}
            onMouseEnter={() => setHovered('settings')}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onNavigate('settings')}
          >
            <span style={{ color: getIconColor('settings', activePage === 'settings'), display: 'flex' }}>
              <Icons.Settings />
            </span>
          </button>
        </Tooltip>
      </div>
    </aside>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: 'var(--sidebar-width)',
    minWidth: 'var(--sidebar-width)',
    height: '100%',
    backgroundColor: 'var(--navbar-bg)',
    borderRight: '0.5px solid var(--color-border)',
    padding: '8px 0 12px',
    gap: 0,
    WebkitAppRegion: 'drag',
  } as React.CSSProperties,
  logo: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'var(--color-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    marginTop: 2,
    flexShrink: 0,
    WebkitAppRegion: 'no-drag',
  } as React.CSSProperties,
  logoText: {
    color: '#fff',
    fontWeight: 700,
    fontSize: 14,
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  bottom: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
}
