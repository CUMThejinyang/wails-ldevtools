import { Modal } from 'antd'
import type { ReactNode } from 'react'

interface OpenArgs {
  title: ReactNode
  content?: ReactNode
  okText?: string
  cancelText?: string
  danger?: boolean
  onOk?: () => void | Promise<void>
  onCancel?: () => void
}

export function openConfirm(args: OpenArgs) {
  return Modal.confirm({
    title: args.title,
    content: args.content,
    okText: args.okText ?? '确认',
    cancelText: args.cancelText ?? '取消',
    okButtonProps: args.danger ? { danger: true } : undefined,
    onOk: args.onOk,
    onCancel: args.onCancel,
    centered: true,
  })
}

export default openConfirm
