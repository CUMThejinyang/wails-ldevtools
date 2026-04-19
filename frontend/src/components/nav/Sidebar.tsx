import { DeleteOutlined, SettingOutlined, SunOutlined, MoonOutlined, CodeOutlined, FunctionOutlined, CloudServerOutlined, ApiOutlined } from '@ant-design/icons'
import type { PageId, ThemeMode } from '@/types'
import { SyncIcon } from '@/icons'
import NavIconButton from './NavIconButton'

const NAV_ITEMS: { id: PageId; icon: React.ReactNode; label: string }[] = [
  { id: 'cleaner', icon: <DeleteOutlined style={{ fontSize: 18 }} />,  label: '文件夹清理' },
  { id: 'sync',    icon: <SyncIcon size={18} />,                        label: '文件夹同步' },
  { id: 'codec',   icon: <CodeOutlined style={{ fontSize: 18 }} />,     label: '编码工具箱' },
  { id: 'env',     icon: <FunctionOutlined style={{ fontSize: 18 }} />, label: '环境变量' },
  { id: 'localserver', icon: <CloudServerOutlined style={{ fontSize: 18 }} />, label: '本地服务' },
  { id: 'ports',   icon: <ApiOutlined style={{ fontSize: 18 }} />,       label: '端口占用' },
]

interface Props {
  activePage: PageId
  onNavigate: (page: PageId) => void
  theme: ThemeMode
  onToggleTheme: () => void
}

export default function Sidebar({ activePage, onNavigate, theme, onToggleTheme }: Props) {
  return (
    <aside style={styles.container}>
      <div style={styles.logo}>
        <span style={styles.logoText}>D</span>
      </div>

      <nav style={styles.nav}>
        {NAV_ITEMS.map((item) => (
          <NavIconButton
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={activePage === item.id}
            onClick={() => onNavigate(item.id)}
          />
        ))}
      </nav>

      <div style={styles.bottom}>
        <NavIconButton
          icon={theme === 'dark'
            ? <SunOutlined style={{ fontSize: 16 }} />
            : <MoonOutlined style={{ fontSize: 16 }} />
          }
          label={theme === 'dark' ? '切换亮色' : '切换暗色'}
          onClick={onToggleTheme}
        />
        <NavIconButton
          icon={<SettingOutlined style={{ fontSize: 18 }} />}
          label="设置"
          active={activePage === 'settings'}
          onClick={() => onNavigate('settings')}
        />
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
    ['--wails-draggable' as never]: 'drag',
  },
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
    ['--wails-draggable' as never]: 'no-drag',
  },
  logoText: { color: '#fff', fontWeight: 700, fontSize: 14 },
  nav: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 },
  bottom: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
}
