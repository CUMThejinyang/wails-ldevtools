import type { ApiRequest, ApiCollection } from '@/types'
import { generateId } from '@/services/bridge'

export function importPostmanCollection(json: string): { name: string; requests: ApiRequest[] } {
  const data = JSON.parse(json)
  const requests: ApiRequest[] = []

  if (data.info?._postman_id || data.item) {
    const walk = (items: any[], parentName: string) => {
      for (const item of items) {
        if (item.request) {
          const req: ApiRequest = {
            id: generateId(),
            name: item.name || '',
            method: (item.request.method || 'GET').toUpperCase() as any,
            url: typeof item.request.url === 'string' ? item.request.url : item.request.url?.raw || '',
            params: [],
            headers: (item.request.header || []).map((h: any) => ({
              key: h.key, value: h.value, enabled: h.disabled ? false : true,
            })),
            body: { type: 'none' },
            auth: { type: 'none' },
          }

          if (item.request.body) {
            if (item.request.body.mode === 'raw') {
              req.body = { type: 'json', jsonContent: item.request.body.raw || '' }
            } else if (item.request.body.mode === 'urlencoded') {
              req.body = { type: 'urlencoded', urlencodedItems: (item.request.body.urlencoded || []).map((p: any) => ({ key: p.key, value: p.value, enabled: true })) }
            } else if (item.request.body.mode === 'formdata') {
              req.body = { type: 'form-data', formItems: (item.request.body.formdata || []).map((p: any) => ({ key: p.key, value: p.src || p.value || '', enabled: true, type: p.type === 'file' ? 'file' : 'text', filePath: p.src || p.value || '' })) }
            }
          }

          if (typeof item.request.url === 'object' && item.request.url.query) {
            req.params = (item.request.url.query || []).map((p: any) => ({
              key: p.key, value: p.value || '', enabled: p.disabled ? false : true,
            }))
          }

          requests.push(req)
        }
        if (item.item) walk(item.item, item.name || parentName)
      }
    }
    walk(data.item, data.info?.name || '')
    return { name: data.info?.name || 'Imported', requests }
  }

  throw new Error('Unrecognized format')
}

export function exportPostmanCollection(collections: ApiCollection[]): string {
  const convertRequests = (items: (ApiCollection | ApiRequest)[]): any[] => {
    return items.map((item) => {
      if ('children' in item) {
        return { name: item.name, item: convertRequests(item.children) }
      }
      const req: any = {
        method: item.method,
        header: item.headers.filter(h => h.enabled && h.key).map(h => ({ key: h.key, value: h.value, disabled: !h.enabled })),
        url: { raw: item.url, query: item.params.filter(p => p.enabled && p.key).map(p => ({ key: p.key, value: p.value })) },
      }
      if (item.body?.type === 'json' && item.body.jsonContent) {
        req.body = { mode: 'raw', raw: item.body.jsonContent }
      } else if (item.body?.type === 'urlencoded' && item.body.urlencodedItems) {
        req.body = { mode: 'urlencoded', urlencoded: item.body.urlencodedItems.map(i => ({ key: i.key, value: i.value })) }
      }
      return { name: item.name || item.url, request: req }
    })
  }

  const mainCollection = collections[0]
  const result = {
    info: { name: mainCollection?.name || 'DevTools Export', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    item: mainCollection ? convertRequests(mainCollection.children) : [],
  }
  return JSON.stringify(result, null, 2)
}
