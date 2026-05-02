import { useState } from 'react'
import { Button, Modal, Input } from 'antd'
import { PlusOutlined, FolderAddOutlined } from '@ant-design/icons'
import type { ApiCollection } from '@/types'
import { generateId } from '@/services/bridge'

interface Props {
  collections: ApiCollection[]
  activeRequestId: string | null
  onSelectRequest: (id: string) => void
  onAddCollection: (name: string) => void
  onAddFolder: (parentId: string, name: string) => void
  onDeleteItem: (id: string) => void
}

export default function CollectionTree({ collections, activeRequestId, onSelectRequest, onAddCollection, onAddFolder, onDeleteItem }: Props) {
  const [showNewCol, setShowNewCol] = useState(false)
  const [newColName, setNewColName] = useState('')

  const handleCreate = () => {
    if (newColName.trim()) {
      onAddCollection(newColName.trim())
      setNewColName('')
      setShowNewCol(false)
    }
  }

  const renderTree = (items: (ApiCollection | any)[], level: number): React.ReactNode => {
    return items.map((item) => {
      if ('children' in item) {
        return (
          <div key={item.id}>
            <div style={{ ...styles.node, paddingLeft: 12 + level * 16 }}>
              <span style={{ color: 'var(--color-text-2)', marginRight: 4 }}>📁</span>
              <span>{item.name}</span>
              <Button type="text" size="small" icon={<FolderAddOutlined />} style={{ marginLeft: 'auto' }} onClick={() => {
                const name = prompt('文件夹名称:')
                if (name) onAddFolder(item.id, name)
              }} />
            </div>
            {item.children && item.children.length > 0 && renderTree(item.children, level + 1)}
          </div>
        )
      }
      return (
        <div
          key={item.id}
          style={{ ...styles.node, paddingLeft: 24 + level * 16, background: activeRequestId === item.id ? 'var(--color-bg-2)' : 'transparent', cursor: 'pointer' }}
          onClick={() => onSelectRequest(item.id)}
        >
          <span style={{ ...styles.method, color: GET_METHOD_COLOR(item.method) }}>{item.method}</span>
          <span style={styles.reqName}>{item.name || item.url}</span>
        </div>
      )
    })
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>集合</span>
        <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => setShowNewCol(true)} />
      </div>
      <div style={styles.tree}>
        {collections.length === 0 ? (
          <div style={styles.empty}>暂无集合，点击 + 创建</div>
        ) : renderTree(collections, 0)}
      </div>

      <Modal title="新建集合" open={showNewCol} onOk={handleCreate} onCancel={() => setShowNewCol(false)}>
        <Input value={newColName} onChange={(e) => setNewColName(e.target.value)} placeholder="集合名称" onPressEnter={handleCreate} />
      </Modal>
    </div>
  )
}

function GET_METHOD_COLOR(m: string): string {
  const map: Record<string, string> = { GET: '#61affe', POST: '#49cc90', PUT: '#fca130', DELETE: '#f93e3e', PATCH: '#50e3c2', HEAD: '#9012fe', OPTIONS: '#0d5aa7' }
  return map[m] || '#aaa'
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '50%', borderBottom: '1px solid var(--color-border)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderBottom: '1px solid var(--color-border)' },
  title: { fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)' },
  tree: { overflow: 'auto', flex: 1 },
  empty: { padding: 16, textAlign: 'center', color: 'var(--color-text-3)', fontSize: 12 },
  node: { display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', fontSize: 12, whiteSpace: 'nowrap' as any, overflow: 'hidden', textOverflow: 'ellipsis' },
  method: { fontSize: 10, fontWeight: 700, width: 48, flexShrink: 0 },
  reqName: { overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--color-text-1)' },
}
