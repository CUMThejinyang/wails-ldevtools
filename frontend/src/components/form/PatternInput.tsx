import { useState, type KeyboardEvent } from 'react'
import { Input, Tag } from 'antd'
import { PlusOutlined } from '@ant-design/icons'

interface Props {
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  disabled?: boolean
}

export default function PatternInput({ value, onChange, placeholder = '回车添加，如 *.log', disabled }: Props) {
  const [draft, setDraft] = useState('')

  const add = () => {
    const p = draft.trim()
    if (!p) return
    if (value.includes(p)) { setDraft(''); return }
    onChange([...value, p])
    setDraft('')
  }

  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx))

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); add() }
    else if (e.key === 'Backspace' && !draft && value.length) { remove(value.length - 1) }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        alignItems: 'center',
        padding: '4px 8px',
        minHeight: 30,
        border: '1px solid var(--color-border)',
        borderRadius: 7,
        backgroundColor: 'var(--color-background-soft)',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {value.map((p, i) => (
        <Tag
          key={`${p}-${i}`}
          closable={!disabled}
          onClose={() => remove(i)}
          style={{ margin: 0 }}
        >
          {p}
        </Tag>
      ))}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={add}
        placeholder={value.length === 0 ? placeholder : ''}
        disabled={disabled}
        prefix={<PlusOutlined style={{ color: 'var(--color-text-3)' }} />}
        variant="borderless"
        style={{ flex: 1, minWidth: 120, padding: 0 }}
      />
    </div>
  )
}
