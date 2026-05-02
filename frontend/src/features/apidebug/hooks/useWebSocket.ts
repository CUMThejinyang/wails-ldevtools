import { useState, useRef, useCallback } from 'react'
import { generateId } from '@/services/bridge'

export interface WSMessage {
  id: string
  direction: 'sent' | 'received'
  content: string
  timestamp: number
  size: number
}

export function useWebSocket() {
  const [connected, setConnected] = useState(false)
  const [messages, setMessages] = useState<WSMessage[]>([])
  const wsRef = useRef<WebSocket | null>(null)

  const connect = useCallback((url: string) => {
    if (wsRef.current) wsRef.current.close()
    try {
      const ws = new WebSocket(url)
      ws.onopen = () => setConnected(true)
      ws.onclose = () => setConnected(false)
      ws.onerror = () => setConnected(false)
      ws.onmessage = (event) => {
        setMessages((prev) => [...prev, {
          id: generateId(),
          direction: 'received',
          content: typeof event.data === 'string' ? event.data : '[Binary]',
          timestamp: Date.now(),
          size: typeof event.data === 'string' ? new Blob([event.data]).size : event.data.size,
        }])
      }
      wsRef.current = ws
    } catch (err: any) {
      console.error('WebSocket connect error:', err)
    }
  }, [])

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setConnected(false)
  }, [])

  const send = useCallback((content: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(content)
      setMessages((prev) => [...prev, {
        id: generateId(),
        direction: 'sent',
        content,
        timestamp: Date.now(),
        size: new Blob([content]).size,
      }])
    }
  }, [])

  const clearMessages = useCallback(() => setMessages([]), [])

  return { connected, messages, connect, disconnect, send, clearMessages }
}
