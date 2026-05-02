import { useState } from 'react'
import { Button, Input, Checkbox, Tooltip } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import type { ApiKvPair } from '@/types'

interface KvEditorProps {
  items: ApiKvPair[]
  onChange: (items: ApiKvPair[]) => void
  keyPlaceholder?: string
  valuePlaceholder?: string
  showDescription?: boolean
  readonly?: boolean
}

export default function KvEditor({ items, onChange, keyPlaceholder = 'Key', valuePlaceholder = 'Value', showDescription = false, readonly = false }: KvEditorProps) {
  const updateItem = (index: number, patch: Partial<ApiKvPair>) => {
    const next = items.map((item, i) => i === index ? { ...item, ...patch } : item)
    onChange(next)
  }

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index))
  }

  const addItem = () => {
    onChange([...items, { key: '', value: '', enabled: true }])
  }

  return (
    <div style={styles.container}>
      {items.map((item, i) => (
        <div key={i} style={styles.row}>
          <Checkbox
            checked={item.enabled}
            onChange={(e) => updateItem(i, { enabled: e.target.checked })}
            disabled={readonly}
          />
          <Input
            size="small"
            placeholder={keyPlaceholder}
            value={item.key}
            onChange={(e) => updateItem(i, { key: e.target.value })}
            style={styles.keyInput}
            readOnly={readonly}
          />
          <Input
            size="small"
            placeholder={valuePlaceholder}
            value={item.value}
            onChange={(e) => updateItem(i, { value: e.target.value })}
            style={styles.valueInput}
            readOnly={readonly}
          />
          {showDescription && (
            <Input
              size="small"
              placeholder="描述"
              value={item.description || ''}
              onChange={(e) => updateItem(i, { description: e.target.value })}
              style={styles.descInput}
              readOnly={readonly}
            />
          )}
          {!readonly && (
            <Tooltip title="删除">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => removeItem(i)} />
            </Tooltip>
          )}
        </div>
      ))}
      {!readonly && (
        <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addItem} style={styles.addBtn}>
          添加
        </Button>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: 4 },
  row: { display: 'flex', gap: 6, alignItems: 'center' },
  keyInput: { width: 180 },
  valueInput: { flex: 1 },
  descInput: { width: 140 },
  addBtn: { width: '100%', marginTop: 4 },
}
