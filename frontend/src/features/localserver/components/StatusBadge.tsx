import { Tag } from 'antd'

interface Props {
  running: boolean
  error?: string
}

export default function StatusBadge({ running, error }: Props) {
  if (error && !running) {
    return <Tag color="error">错误: {error}</Tag>
  }
  if (running) {
    return <Tag color="success">运行中</Tag>
  }
  return <Tag>已停止</Tag>
}
