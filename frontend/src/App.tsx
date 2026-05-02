import { useEffect, useState } from 'react'
import { ConfigProvider, App as AntdApp } from 'antd'
import TitleBar from '@/components/nav/TitleBar'
import Sidebar from '@/components/nav/Sidebar'
import CleanerPage from '@/features/cleaner'
import SyncPage from '@/features/sync'
import CodecPage from '@/features/codec'
import EnvPage from '@/features/env'
import LocalServerPage from '@/features/localserver'
import PortsPage from '@/features/ports'
import ApiDebugPage from '@/features/apidebug'
import SettingsPage from '@/features/settings'
import { KeepAlive } from '@/app/keepalive'
import { applyThemeAttribute, buildAntdTheme } from '@/app/theme'
import { bridge } from '@/services/bridge'
import type { PageId, ThemeMode } from '@/types'

export default function App() {
  const [activePage, setActivePage] = useState<PageId>('cleaner')
  const [theme, setTheme] = useState<ThemeMode>('dark')

  useEffect(() => {
    bridge.getTheme()
      .then((t) => setThemeBoth(((t === 'light' ? 'light' : 'dark') as ThemeMode)))
      .catch(() => setThemeBoth('dark'))
  }, [])

  const setThemeBoth = (t: ThemeMode) => {
    setTheme(t)
    applyThemeAttribute(t)
  }

  const onToggleTheme = async () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark'
    setThemeBoth(next)
    try { await bridge.setTheme(next) } catch { /* ignore */ }
  }

  return (
    <ConfigProvider theme={buildAntdTheme(theme)}>
      <AntdApp>
        <div style={styles.root}>
        <TitleBar />
        <div style={styles.body}>
          <Sidebar
            activePage={activePage}
            onNavigate={setActivePage}
            theme={theme}
            onToggleTheme={onToggleTheme}
          />
          <main style={styles.main}>
            {/*
              用 position:absolute + inset:0 给每个页面容器一个确定高度，
              这样即使 react-activation 的 KeepAlive 内部 wrapper 不继承高度，
              整个 flex 链条从 main→pageContainer→KeepAlive→PageShell 也能正确传递高度，
              解决"页面内容溢出无法滚动"和"侧边栏背景高度不足"两个问题。
            */}
            <div className="page-slot" style={activePage === 'cleaner' ? styles.pageSlot : styles.pageHidden}>
              <KeepAlive id="cleaner"><CleanerPage /></KeepAlive>
            </div>
            <div className="page-slot" style={activePage === 'sync' ? styles.pageSlot : styles.pageHidden}>
              <KeepAlive id="sync"><SyncPage /></KeepAlive>
            </div>
            <div className="page-slot" style={activePage === 'codec' ? styles.pageSlot : styles.pageHidden}>
              <KeepAlive id="codec"><CodecPage /></KeepAlive>
            </div>
            <div className="page-slot" style={activePage === 'env' ? styles.pageSlot : styles.pageHidden}>
              <KeepAlive id="env"><EnvPage /></KeepAlive>
            </div>
            <div className="page-slot" style={activePage === 'localserver' ? styles.pageSlot : styles.pageHidden}>
              <KeepAlive id="localserver"><LocalServerPage /></KeepAlive>
            </div>
            <div className="page-slot" style={activePage === 'ports' ? styles.pageSlot : styles.pageHidden}>
              <KeepAlive id="ports"><PortsPage /></KeepAlive>
            </div>
            <div className="page-slot" style={activePage === 'apidebug' ? styles.pageSlot : styles.pageHidden}>
              <KeepAlive id="apidebug"><ApiDebugPage /></KeepAlive>
            </div>
            <div className="page-slot" style={activePage === 'settings' ? styles.pageSlot : styles.pageHidden}>
              <KeepAlive id="settings"><SettingsPage theme={theme} onToggleTheme={onToggleTheme} /></KeepAlive>
            </div>
          </main>
        </div>
      </div>
      </AntdApp>
    </ConfigProvider>
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
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  main: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
    borderTopLeftRadius: 10,
    borderLeft: '0.5px solid var(--color-border)',
    borderTop: '0.5px solid var(--color-border)',
    backgroundColor: 'var(--color-background)',
  },
  pageSlot: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  pageHidden: {
    display: 'none',
  },
}
