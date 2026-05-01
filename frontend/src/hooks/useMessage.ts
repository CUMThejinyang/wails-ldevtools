import { App } from 'antd'
import type { MessageInstance } from 'antd/es/message/interface'
import type { ModalStaticFunctions } from 'antd/es/modal/confirm'

export function useMessage(): MessageInstance {
  const { message } = App.useApp()
  return message
}

export function useModal(): Omit<ModalStaticFunctions, 'warn'> {
  const { modal } = App.useApp()
  return modal
}
