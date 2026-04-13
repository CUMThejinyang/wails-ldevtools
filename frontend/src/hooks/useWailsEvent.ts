import { useEffect } from 'react'

export function useWailsEvent<T = unknown>(
  event: string,
  handler: (data: T) => void,
  deps: React.DependencyList = [],
) {
  useEffect(() => {
    const rt = window.runtime
    if (!rt?.EventsOn) return
    rt.EventsOn(event, (data) => handler(data as T))
    return () => rt.EventsOff(event)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, ...deps])
}
