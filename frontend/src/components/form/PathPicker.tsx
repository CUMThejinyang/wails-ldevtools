import { Button, Input, message } from 'antd'
import { FolderOpenOutlined } from '@ant-design/icons'
import { bridge } from '@/services/bridge'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  style?: React.CSSProperties
  mode?: 'directory' | 'file' | 'save-file'
  title?: string
}

export default function PathPicker({
  value,
  onChange,
  placeholder = '请选择路径',
  disabled,
  style,
  mode = 'directory',
  title,
}: Props) {
  const pick = async () => {
    try {
      const picked = mode === 'file'
        ? await bridge.selectFile(title || '选择文件')
        : mode === 'save-file'
          ? await bridge.selectSaveFile(title || '保存文件')
          : await bridge.selectDirectory()
      if (picked) onChange(picked)
    } catch (err) {
      const action = mode === 'file' ? '选择文件' : mode === 'save-file' ? '保存文件' : '选择目录'
      message.error(`${action}失败：${(err as Error).message}`)
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
