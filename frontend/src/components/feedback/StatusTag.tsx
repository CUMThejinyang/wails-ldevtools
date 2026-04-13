import { Tag } from 'antd'

export type StatusKind =
  | 'pending' | 'scanning' | 'deleting' | 'syncing'
  | 'done' | 'synced' | 'error' | 'cancelled' | 'skipped'
  | 'new' | 'modified' | 'identical'

const MAP: Record<StatusKind, { color: string; label: string }> = {
  pending:    { color: 'default', label: '待处理' },
  scanning:   { color: 'processing', label: '扫描中' },
  deleting:   { color: 'processing', label: '清理中' },
  syncing:    { color: 'processing', label: '同步中' },
  done:       { color: 'success', label: '完成' },
  synced:     { color: 'success', label: '已同步' },
  error:      { color: 'error', label: '失败' },
  cancelled:  { color: 'warning', label: '已取消' },
  skipped:    { color: 'default', label: '跳过' },
  new:        { color: 'success', label: '新增' },
  modified:   { color: 'warning', label: '已修改' },
  identical:  { color: 'default', label: '一致' },
}

interface Props {
  status: StatusKind
  text?: React.ReactNode
}

export default function StatusTag({ status, text }: Props) {
  const cfg = MAP[status]
  return <Tag color={cfg.color} style={{ margin: 0 }}>{text ?? cfg.label}</Tag>
}
