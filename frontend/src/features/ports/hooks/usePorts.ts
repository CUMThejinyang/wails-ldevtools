import { useState, useEffect, useCallback, useRef } from 'react'
import { bridge } from '@/services/bridge'
import type { PortEntry } from '@/types'

export interface UsePortsResult {
  data: PortEntry[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  pollingInterval: number
  setPollingInterval: (ms: number) => void
}

export function usePorts(): UsePortsResult {
  const [data, setData] = useState<PortEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pollingInterval, setPollingIntervalState] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const entries = await bridge.listPorts()
      if (mountedRef.current) {
        setData(entries ?? [])
      }
    } catch (e: unknown) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : String(e))
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [])

  // Initial load
  useEffect(() => {
    mountedRef.current = true
    refresh()
    return () => { mountedRef.current = false }
  }, [refresh])

  // Polling logic
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (pollingInterval > 0) {
      timerRef.current = setInterval(refresh, pollingInterval)
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [pollingInterval, refresh])

  // Pause polling when tab hidden, resume when visible
  useEffect(() => {
    if (pollingInterval <= 0) return
    const handler = () => {
      if (document.visibilityState === 'hidden') {
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
      } else {
        if (!timerRef.current) {
          refresh()
          timerRef.current = setInterval(refresh, pollingInterval)
        }
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [pollingInterval, refresh])

  const setPollingInterval = useCallback((ms: number) => {
    setPollingIntervalState(ms)
  }, [])

  return { data, loading, error, refresh, pollingInterval, setPollingInterval }
}
