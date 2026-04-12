import { useState } from 'react'

interface Props {
  theme: string
  onToggleTheme: () => void
}

export default function SettingsPage({ theme, onToggleTheme }: Props) {
  const [activeSection, setActiveSection] = useState<'general' | 'about'>('general')

  return (
    <div style={styles.page}>
      {/* 页面标题栏 */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <IcoSettings />
          <span style={styles.title}>设置</span>
        </div>
      </div>

      <div style={styles.body}>
        {/* 左侧设置分类 */}
        <aside style={styles.settingsSidebar}>
          {[
            { id: 'general', label: '通用' },
            { id: 'about',   label: '关于' },
          ].map((item) => (
            <button
              key={item.id}
              style={{
                ...styles.sidebarItem,
                ...(activeSection === item.id ? styles.sidebarItemActive : {}),
              }}
              onClick={() => setActiveSection(item.id as typeof activeSection)}
            >
              {item.label}
            </button>
          ))}
        </aside>

        {/* 右侧内容 */}
        <div style={styles.settingsContent}>
          {activeSection === 'general' && (
            <GeneralSettings theme={theme} onToggleTheme={onToggleTheme} />
          )}
          {activeSection === 'about' && <AboutSection />}
        </div>
      </div>
    </div>
  )
}

// ── 通用设置 ──
function GeneralSettings({ theme, onToggleTheme }: { theme: string; onToggleTheme: () => void }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>外观</div>

      <div style={styles.settingRow}>
        <div>
          <div style={styles.settingLabel}>主题</div>
          <div style={styles.settingDesc}>选择界面明暗风格</div>
        </div>
        <div style={styles.themeToggle}>
          {(['dark', 'light'] as const).map((t) => (
            <button
              key={t}
              style={{
                ...styles.themeBtn,
                ...(theme === t ? styles.themeBtnActive : {}),
              }}
              onClick={() => theme !== t && onToggleTheme()}
            >
              {t === 'dark' ? '🌙 暗色' : '☀️ 亮色'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── 关于 ──
function AboutSection() {
  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>关于 DevTools</div>
      <div style={styles.aboutCard}>
        <div style={styles.aboutLogo}>D</div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-1)', marginBottom: 4 }}>
            DevTools
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 2 }}>版本 1.0.0</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>
            基于 Wails v2 + React + Go 构建的程序员工具箱
          </div>
        </div>
      </div>

      <div style={styles.techRow}>
        {[
          { label: 'Wails',  ver: 'v2.9' },
          { label: 'React',  ver: 'v18' },
          { label: 'Go',     ver: 'v1.21' },
        ].map((t) => (
          <div key={t.label} style={styles.techTag}>
            <span style={{ color: 'var(--color-text-2)' }}>{t.label}</span>
            <span style={{ color: 'var(--color-text-3)', fontSize: 11 }}>{t.ver}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 图标 ──
function IcoSettings() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
         stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}

// ── 样式 ──
const styles: Record<string, React.CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 20px', height: 52, minHeight: 52,
    borderBottom: '0.5px solid var(--color-border)',
    backgroundColor: 'var(--color-background-soft)',
    flexShrink: 0,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  title: { fontSize: 15, fontWeight: 600, color: 'var(--color-text-1)' },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  settingsSidebar: {
    width: 160, minWidth: 160,
    borderRight: '0.5px solid var(--color-border)',
    padding: '12px 8px',
    display: 'flex', flexDirection: 'column', gap: 2,
    backgroundColor: 'var(--color-background-soft)',
  },
  sidebarItem: {
    display: 'block', width: '100%',
    padding: '8px 12px',
    borderRadius: 7, border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--color-text-2)',
    fontSize: 13, textAlign: 'left',
    cursor: 'pointer',
    transition: 'background-color 0.15s, color 0.15s',
  },
  sidebarItemActive: {
    backgroundColor: 'var(--color-primary-mute)',
    color: 'var(--color-primary)',
    fontWeight: 500,
  },
  settingsContent: { flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 },
  section: {
    backgroundColor: 'var(--color-background-soft)',
    border: '0.5px solid var(--color-border)',
    borderRadius: 10, overflow: 'hidden',
  },
  sectionTitle: {
    padding: '10px 16px',
    fontSize: 12, fontWeight: 500,
    color: 'var(--color-text-3)',
    backgroundColor: 'var(--color-background-mute)',
    borderBottom: '0.5px solid var(--color-border)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  settingRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px',
  },
  settingLabel: { fontSize: 13, color: 'var(--color-text-1)', fontWeight: 500, marginBottom: 2 },
  settingDesc: { fontSize: 12, color: 'var(--color-text-3)' },
  themeToggle: { display: 'flex', gap: 6 },
  themeBtn: {
    padding: '6px 14px', borderRadius: 7,
    border: '0.5px solid var(--color-border)',
    backgroundColor: 'transparent',
    color: 'var(--color-text-2)',
    fontSize: 13, cursor: 'pointer',
    transition: 'all 0.15s',
  },
  themeBtnActive: {
    backgroundColor: 'var(--color-primary-mute)',
    borderColor: 'var(--color-primary)',
    color: 'var(--color-primary)',
    fontWeight: 500,
  },
  aboutCard: {
    display: 'flex', alignItems: 'center', gap: 16,
    padding: '16px 16px',
    borderBottom: '0.5px solid var(--color-border-soft)',
  },
  aboutLogo: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: 'var(--color-primary)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: 20, fontWeight: 700,
    flexShrink: 0,
  },
  techRow: { display: 'flex', gap: 8, padding: '12px 16px' },
  techTag: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '6px 14px', borderRadius: 6,
    backgroundColor: 'var(--color-background-mute)',
    border: '0.5px solid var(--color-border-soft)',
    gap: 2,
  },
}
