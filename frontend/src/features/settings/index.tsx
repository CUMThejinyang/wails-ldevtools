import { useState } from 'react'
import { Button, Tag } from 'antd'
import { MoonOutlined, SunOutlined, SettingOutlined } from '@ant-design/icons'
import PageShell from '@/components/layout/PageShell'
import SectionCard from '@/components/layout/SectionCard'
import type { ThemeMode } from '@/types'

interface Props {
  theme: ThemeMode
  onToggleTheme: () => void
}

type SectionKey = 'general' | 'about'

export default function SettingsPage({ theme, onToggleTheme }: Props) {
  const [section, setSection] = useState<SectionKey>('general')

  return (
    <PageShell title={<><SettingOutlined style={{ color: 'var(--color-primary)', marginRight: 8 }} />设置</>}>
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* 左侧分类 */}
        <aside style={{
          width: 180, minWidth: 160,
          height: '100%',
          borderRight: '0.5px solid var(--color-border)',
          padding: '12px 8px',
          display: 'flex', flexDirection: 'column', gap: 2,
          backgroundColor: 'var(--color-background-soft)',
          flexShrink: 0,
        }}>
          {([
            { id: 'general' as const, label: '通用' },
            { id: 'about' as const, label: '关于' },
          ]).map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 12px', borderRadius: 7,
                border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 500,
                transition: 'background-color 0.15s, color 0.15s',
                backgroundColor: section === item.id ? 'var(--color-active)' : 'transparent',
                color: section === item.id ? 'var(--color-primary)' : 'var(--color-text-2)',
              }}
            >
              {item.label}
            </button>
          ))}
        </aside>

        {/* 右侧内容 */}
        <div style={{ flex: 1, overflow: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {section === 'general' && <GeneralSection theme={theme} onToggleTheme={onToggleTheme} />}
          {section === 'about' && <AboutSection />}
        </div>
      </div>
    </PageShell>
  )
}

// ── 通用设置 ──
function GeneralSection({ theme, onToggleTheme }: { theme: ThemeMode; onToggleTheme: () => void }) {
  return (
    <SectionCard title="外观">
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 0',
      }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--color-text-1)', fontWeight: 500, marginBottom: 2 }}>主题</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>选择界面明暗风格</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['dark', 'light'] as const).map((t) => (
            <Button
              key={t}
              icon={t === 'dark' ? <MoonOutlined /> : <SunOutlined />}
              type={theme === t ? 'primary' : 'default'}
              onClick={() => theme !== t && onToggleTheme()}
            >
              {t === 'dark' ? '暗色' : '亮色'}
            </Button>
          ))}
        </div>
      </div>
    </SectionCard>
  )
}

// ── 关于 ──
function AboutSection() {
  return (
    <SectionCard title="关于 DevTools">
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '16px 0',
        borderBottom: '0.5px solid var(--color-border-soft)',
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10,
          backgroundColor: 'var(--color-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 20, fontWeight: 700, flexShrink: 0,
        }}>
          D
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-1)', marginBottom: 4 }}>
            DevTools
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 2 }}>版本 1.0.0</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>
            基于 Wails v2 + React + Ant Design + Go 构建的程序员工具箱
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '12px 0' }}>
        {[
          { label: 'Wails', ver: 'v2.9' },
          { label: 'React', ver: 'v18' },
          { label: 'Ant Design', ver: 'v5' },
          { label: 'Go', ver: 'v1.21' },
        ].map((t) => (
          <Tag key={t.label} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '6px 14px', borderRadius: 6,
            backgroundColor: 'var(--color-background-mute)',
            border: '0.5px solid var(--color-border-soft)',
            gap: 2,
          }}>
            <span style={{ color: 'var(--color-text-2)' }}>{t.label}</span>
            <span style={{ color: 'var(--color-text-3)', fontSize: 11 }}>{t.ver}</span>
          </Tag>
        ))}
      </div>
    </SectionCard>
  )
}
