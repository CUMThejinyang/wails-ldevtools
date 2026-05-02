import { useState, useCallback } from 'react'
import type { ApiRequest, ApiGlobalConfig, ResponseSnapshot, ApiKvPair } from '@/types'

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

  const addAll = (items: ApiKvPair[], label: string) => {
    items.filter(i => i.enabled && i.key).forEach(i => { result[i.key] = i.value })
  }

  // 低优先级先加（全局 -> 环境 -> 请求级）
  addAll(config.globalHeaders, '全局')
  if (activeEnvId) {
    const env = config.environments.find(e => e.id === activeEnvId)
    if (env) addAll(env.headers, '环境')
  }
  addAll(request.headers, '请求')

  // Auth 处理
  if (request.auth?.type === 'bearer' && request.auth.token) {
    result['Authorization'] = `Bearer ${request.auth.token}`
  } else if (request.auth?.type === 'basic' && request.auth.username) {
    result['Authorization'] = 'Basic ' + btoa(`${request.auth.username}:${request.auth.password || ''}`)
  }

  return result
}

export function useApiRequest() {
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<ResponseSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  const send = useCallback(async (
    request: ApiRequest,
    config: ApiGlobalConfig,
    activeEnvId: string | null,
  ) => {
    setLoading(true)
    setError(null)
    setResponse(null)

    const startTime = performance.now()

    try {
      const env = activeEnvId ? config.environments.find(e => e.id === activeEnvId) : undefined
      const envVars = env?.variables || []
      const resolvedUrl = resolveTemplate(request.url, envVars)

      const headers = mergeHeaders(request, config, activeEnvId)

      if (request.body?.type === 'json' && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json'
      } else if (request.body?.type === 'urlencoded' && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
      } else if (request.body?.type === 'raw' && request.body.rawContentType && !headers['Content-Type']) {
        headers['Content-Type'] = request.body.rawContentType
      }

      let finalUrl = resolvedUrl
      const enabledParams = request.params.filter(p => p.enabled && p.key)
      if (enabledParams.length > 0) {
        const qs = enabledParams.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(resolveTemplate(p.value, envVars))}`).join('&')
        finalUrl += (finalUrl.includes('?') ? '&' : '?') + qs
      }

      let body: BodyInit | undefined
      if (request.body?.type === 'json' && request.body.jsonContent) {
        body = resolveTemplate(request.body.jsonContent, envVars)
      } else if (request.body?.type === 'form-data') {
        const fd = new FormData()
        request.body.formItems?.filter(f => f.enabled && f.key).forEach(f => {
          fd.append(f.key, resolveTemplate(f.value, envVars))
        })
        body = fd
        delete headers['Content-Type']
      } else if (request.body?.type === 'urlencoded' && request.body.urlencodedItems) {
        const usp = new URLSearchParams()
        request.body.urlencodedItems.filter(i => i.enabled && i.key).forEach(i => {
          usp.append(i.key, resolveTemplate(i.value, envVars))
        })
        body = usp.toString()
      } else if (request.body?.type === 'raw' && request.body.rawContent) {
        body = resolveTemplate(request.body.rawContent, envVars)
      }

      const fetchResponse = await fetch(finalUrl, {
        method: request.method,
        headers,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : body,
      })

      const responseHeaders: Record<string, string> = {}
      fetchResponse.headers.forEach((v, k) => { responseHeaders[k] = v })

      const cookies: { name: string; value: string; domain: string; path: string; httpOnly: boolean; secure: boolean }[] = []
      const setCookieHeader = fetchResponse.headers.get('set-cookie')
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

      const responseText = await fetchResponse.text()
      const endTime = performance.now()

      setResponse({
        status: fetchResponse.status,
        statusText: fetchResponse.statusText,
        headers: responseHeaders,
        body: responseText,
        size: new Blob([responseText]).size,
        durationMs: Math.round(endTime - startTime),
        cookies,
      })
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  return { loading, response, error, send }
}
