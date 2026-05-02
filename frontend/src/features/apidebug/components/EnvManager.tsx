import { useState } from 'react'
import { Modal, Input, Button } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import KvEditor from './KvEditor'
import type { ApiEnv } from '@/types'
import { generateId } from '@/services/bridge'

interface Props {
  open: boolean
  environments: ApiEnv[]
  onClose: () => void
  onSave: (envs: ApiEnv[]) => void
}

export default function EnvManager({ open, environments, onClose, onSave }: Props) {
  const [envs, setEnvs] = useState<ApiEnv[]>(() => environments.length > 0 ? environments : [{ id: generateId(), name: '开发', variables: [], headers: [] }])
  const [activeIdx, setActiveIdx] = useState(0)

  const active = envs[activeIdx] || envs[0]

  const updateActive = (patch: Partial<ApiEnv>) => {
    const next = [...envs]
    if (next[activeIdx]) {
      next[activeIdx] = { ...next[activeIdx], ...patch }
    }
    setEnvs(next)
  }

  const addEnv = () => {
    const id = generateId()
    setEnvs([...envs, { id, name: `环境 ${envs.length + 1}`, variables: [], headers: [] }])
    setActiveIdx(envs.length)
  }

  const deleteEnv = (idx: number) => {
    const next = envs.filter((_, i) => i !== idx)
    setEnvs(next)
    if (activeIdx >= next.length) setActiveIdx(next.length - 1)
  }

  const handleOk = () => {
    onSave(envs.filter(e => e.name.trim()))
    onClose()
  }

  return (
    <Modal title="环境管理" open={open} onOk={handleOk} onCancel={onClose} width={700}>
      <div style={{ display: 'flex', gap: 16, minHeight: 350 }}>
        <div style={{ width: 160, borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {envs.map((e, i) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span
                onClick={() => setActiveIdx(i)}
                style={{ flex: 1, cursor: 'pointer', padding: '4px 8px', borderRadius: 4, background: i === activeIdx ? 'var(--color-bg-2)' : 'transparent', fontSize: 13 }}
              >{e.name || '(未命名)'}</span>
              <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => deleteEnv(i)} />
            </div>
          ))}
          <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addEnv} style={{ marginTop: 8 }}>添加环境</Button>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input size="small" value={active?.name || ''} onChange={(e) => updateActive({ name: e.target.value })} placeholder="环境名称" style={{ width: 200 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 4 }}>变量</div>
            <KvEditor
              items={active?.variables || []}
              onChange={(items) => updateActive({ variables: items })}
              keyPlaceholder="变量名"
              valuePlaceholder="变量值"
            />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 4 }}>环境级 Header</div>
            <KvEditor
              items={active?.headers || []}
              onChange={(items) => updateActive({ headers: items })}
              keyPlaceholder="Header 名"
              valuePlaceholder="Header 值"
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}
