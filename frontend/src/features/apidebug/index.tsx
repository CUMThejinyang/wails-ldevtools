import { ApiOutlined } from '@ant-design/icons'
import PageShell from '@/components/layout/PageShell'

export default function ApiDebugPage() {
  return (
    <PageShell
      title={<><ApiOutlined style={{ color: 'var(--color-primary)', marginRight: 8 }} />API 调试器</>}
    >
      <div style={{ padding: 24, color: 'var(--color-text-3)', textAlign: 'center', marginTop: 48 }}>
        API 调试器开发中...
      </div>
    </PageShell>
  )
}
