import type { ModalStaticFunctions } from 'antd/es/modal/confirm'
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

export function openConfirm(modal: Omit<ModalStaticFunctions, 'warn'>, args: OpenArgs) {
  return modal.confirm({
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
