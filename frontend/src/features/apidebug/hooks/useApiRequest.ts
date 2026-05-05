import { useState, useCallback } from 'react'
import type { ApiRequest, ApiGlobalConfig, ResponseSnapshot, ApiKvPair, HttpMultipartItem } from '@/types'
import { bridge } from '@/services/bridge'

function resolveTemplate(str: string, vars: ApiKvPair[]): string {
  return str.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    const found = vars.find(v => v.key === name && v.enabled)
    return found ? found.value : `{{${name}}}`
  })
}

function mergeHeaders(
  request: ApiRequest,
  config: ApiGlobalConfig,
  activeEnvId: string | null,
): Record<string, string> {
  const result: Record<string, string> = {}

  const addAll = (items: ApiKvPair[]) => {
    items.filter(i => i.enabled && i.key).forEach(i => { result[i.key] = i.value })
  }

  addAll(config.globalHeaders)
  if (activeEnvId) {
    const env = config.environments.find(e => e.id === activeEnvId)
    if (env) addAll(env.headers)
  }
  addAll(request.headers)

  return result
}

function buildBody(request: ApiRequest, vars: ApiKvPair[]): { body: string; headers: Record<string, string>; multipartItems: HttpMultipartItem[] } {
  const headers: Record<string, string> = {}

  if (request.body?.type === 'json' && request.body.jsonContent) {
    return {
      body: resolveTemplate(request.body.jsonContent, vars),
      headers: { 'Content-Type': 'application/json' },
      multipartItems: [],
    }
  }

  if (request.body?.type === 'form-data' && request.body.formItems) {
    const multipartItems = request.body.formItems
      .filter(f => f.enabled && f.key)
      .map((f) => {
        const resolvedValue = resolveTemplate(f.value, vars)
        if (f.type === 'file') {
          return { key: f.key, value: resolvedValue, kind: 'file' as const, filePath: f.filePath || resolvedValue }
        }
        return { key: f.key, value: resolvedValue, kind: 'text' as const }
      })
    return { body: '', headers: {}, multipartItems }
  }

  if (request.body?.type === 'urlencoded' && request.body.urlencodedItems) {
    const usp = new URLSearchParams()
    request.body.urlencodedItems.filter(i => i.enabled && i.key).forEach(i => {
      usp.append(i.key, resolveTemplate(i.value, vars))
    })
    return {
      body: usp.toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      multipartItems: [],
    }
  }

  if (request.body?.type === 'raw' && request.body.rawContent) {
    const h: Record<string, string> = {}
    if (request.body.rawContentType) h['Content-Type'] = request.body.rawContentType
    return { body: resolveTemplate(request.body.rawContent, vars), headers: h, multipartItems: [] }
  }

  return { body: '', headers: {}, multipartItems: [] }
}

export function useApiRequest() {
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<ResponseSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  const send = useCallback(async (
    request: ApiRequest,
    config: ApiGlobalConfig,
    activeEnvId: string | null,
  ): Promise<ResponseSnapshot | null> => {
    setLoading(true)
    setError(null)
    setResponse(null)

    try {
      const env = activeEnvId ? config.environments.find(e => e.id === activeEnvId) : undefined
      const envVars = env?.variables || []
      const resolvedUrl = resolveTemplate(request.url, envVars)

      const headers = mergeHeaders(request, config, activeEnvId)

      let finalUrl = resolvedUrl
      const enabledParams = request.params.filter(p => p.enabled && p.key)
      if (enabledParams.length > 0) {
        const qs = enabledParams.map(p =>
          `${encodeURIComponent(p.key)}=${encodeURIComponent(resolveTemplate(p.value, envVars))}`
        ).join('&')
        finalUrl += (finalUrl.includes('?') ? '&' : '?') + qs
      }

      const { body, headers: bodyHeaders, multipartItems } = buildBody(request, envVars)
      Object.assign(headers, bodyHeaders)

      const result = await bridge.sendHttpRequest({
        method: request.method,
        url: finalUrl,
        headers,
        body,
        multipartItems,
      })

      const cookies: ResponseSnapshot['cookies'] = []
      const setCookieHeader = result.headers['set-cookie']
      if (setCookieHeader) {
        const parts = setCookieHeader.split(';')
        const nv = parts[0].split('=')
        const urlObj = new URL(finalUrl)
        cookies.push({
          name: nv[0],
          value: nv.slice(1).join('='),
          domain: urlObj.hostname,
          path: '/',
          httpOnly: setCookieHeader.toLowerCase().includes('httponly'),
          secure: setCookieHeader.toLowerCase().includes('secure'),
        })
      }

      const snapshot: ResponseSnapshot = {
        status: result.status,
        statusText: result.statusText,
        headers: result.headers,
        body: result.body,
        size: result.size,
        durationMs: result.durationMs,
        cookies,
      }

      setResponse(snapshot)
      return snapshot
    } catch (err: any) {
      setError(err?.message || String(err))
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { loading, response, error, send }
}
