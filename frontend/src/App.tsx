import { useState, useEffect } from 'react'
import { KeepAlive } from 'react-activation'
import Sidebar from './components/Sidebar'
import TitleBar from './components/TitleBar'
import CleanerPage from './pages/Cleaner'
import SyncPage from './pages/Sync'
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
          {activePage === 'cleaner'  && <KeepAlive id="cleaner"><CleanerPage /></KeepAlive>}
          {activePage === 'sync'     && <KeepAlive id="sync"><SyncPage /></KeepAlive>}
          {activePage === 'settings' && <KeepAlive id="settings"><SettingsPage theme={theme} onToggleTheme={toggleTheme} /></KeepAlive>}
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
}
