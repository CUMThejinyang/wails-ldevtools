import { AliveScope, KeepAlive as RAKeepAlive } from 'react-activation'
import type { PropsWithChildren, ReactNode } from 'react'

export function AppAliveScope({ children }: PropsWithChildren) {
  return <AliveScope>{children}</AliveScope>
}

export function KeepAlive({ id, children }: { id: string; children: ReactNode }) {
  return <RAKeepAlive id={id} name={id}>{children}</RAKeepAlive>
}
