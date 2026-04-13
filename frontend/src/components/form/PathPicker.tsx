import { Button, Input, message } from 'antd'
import { FolderOpenOutlined } from '@ant-design/icons'
import { bridge } from '@/services/bridge'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  style?: React.CSSProperties
}

export default function PathPicker({ value, onChange, placeholder = '请选择路径', disabled, style }: Props) {
  const pick = async () => {
    try {
      const picked = await bridge.selectDirectory()
      if (picked) onChange(picked)
    } catch (err) {
      message.error(`选择目录失败：${(err as Error).message}`)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 6, ...style }}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{ flex: 1 }}
      />
      <Button
        icon={<FolderOpenOutlined />}
        onClick={pick}
        disabled={disabled}
      >
        浏览
      </Button>
    </div>
  )
}
