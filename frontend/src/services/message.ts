import type { MessageInstance } from 'antd/es/message/interface'

let _api: MessageInstance | null = null

export function _initMessageApi(api: MessageInstance) {
  _api = api
}

// Proxy that delegates to the theme-aware instance from App.useApp()
export const message = new Proxy({} as MessageInstance, {
  get(_target, prop: string | symbol) {
    const fn = (_api as any)?.[prop]
    return typeof fn === 'function' ? fn.bind(_api) : fn
  },
})
