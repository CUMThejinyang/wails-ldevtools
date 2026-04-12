import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import TitleBar from './components/TitleBar'
import CleanerPage from './pages/Cleaner'
import SettingsPage from './pages/Settings'
import { bridge } from './hooks/bridge'
import type { PageId } from './types'

export default function App() {
  const [activePage, setActivePage] = useState<PageId>('cleaner')
  const [theme, setTheme] = useState<string>('dark')

  useEffect(() => {
    bridge.getTheme()
      .then((t) => applyTheme(t))
      .catch(() => applyTheme('dark'))
  }, [])

  const applyTheme = (t: string) => {
    setTheme(t)
    document.body.setAttribute('theme-mode', t)
  }

  const toggleTheme = async () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    try { await bridge.setTheme(next) } catch {}
  }

  const pageTitles: Record<PageId, string> = {
    cleaner:  '文件夹清理工具',
    settings: '设置',
  }

  return (
    <div style={styles.root}>
      {/* 自定义标题栏（最顶层，横跨全宽） */}
      <TitleBar />

      {/* 主体：侧边栏 + 内容区 */}
      <div style={styles.body}>
        <Sidebar
          activePage={activePage}
          onNavigate={setActivePage}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        <main style={styles.main}>
          {/* 二级 Navbar */}
          <div style={styles.navbar}>
            <span style={styles.pageTitle}>{pageTitles[activePage]}</span>
            <span style={styles.version}>v1.0.0</span>
          </div>

          {/* 页面内容 */}
          <div style={styles.content}>
            {activePage === 'cleaner'  && <CleanerPage />}
            {activePage === 'settings' && <SettingsPage theme={theme} onToggleTheme={toggleTheme} />}
          </div>
        </main>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100vh',
    overflow: 'hidden',
    backgroundColor: 'var(--color-background)',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  main: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflow: 'hidden',
    borderTopLeftRadius: 10,
    borderLeft: '0.5px solid var(--color-border)',
    borderTop: '0.5px solid var(--color-border)',
    backgroundColor: 'var(--color-background)',
  },
  navbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
    minHeight: 44,
    padding: '0 20px',
    backgroundColor: 'var(--navbar-bg)',
    borderBottom: '0.5px solid var(--color-border)',
    flexShrink: 0,
  },
  pageTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-text-2)',
  },
  version: {
    fontSize: 11,
    color: 'var(--color-text-3)',
    fontFamily: 'var(--code-font-family)',
  },
  content: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
}
