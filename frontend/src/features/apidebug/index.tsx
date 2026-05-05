import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { ApiOutlined, SettingOutlined, CloudUploadOutlined, CloudDownloadOutlined } from '@ant-design/icons'
import { Button, Dropdown } from 'antd'
import PageShell from '@/components/layout/PageShell'
import SectionCard from '@/components/layout/SectionCard'
import { useMessage } from '@/hooks/useMessage'
import { bridge, generateId } from '@/services/bridge'
import type { ApiRequest, ApiGlobalConfig, ApiCollection, ApiKvPair, HistoryEntry } from '@/types'
import { useApiRequest } from './hooks/useApiRequest'
import UrlBar from './components/UrlBar'
import RequestPanel from './components/RequestPanel'
import ResponsePanel from './components/ResponsePanel'
import CollectionTree from './components/CollectionTree'
import EnvManager from './components/EnvManager'
import HeaderPreview from './components/HeaderPreview'
import WebSocketPanel from './components/WebSocketPanel'
import { importPostmanCollection, exportPostmanCollection } from './utils/import-export'

function createDefaultRequest(name = ''): ApiRequest {
  return {
    id: generateId(),
    name,
    method: 'GET',
    url: '',
    params: [],
    headers: [],
    body: { type: 'none' },
    auth: { type: 'none' },
  }
}

function findRequestById(items: (ApiCollection | ApiRequest)[], id: string): ApiRequest | null {
  for (const item of items) {
    if ('children' in item) {
      const found = findRequestById(item.children, id)
      if (found) return found
    } else if (item.id === id) {
      return item
    }
  }
  return null
}

function updateNodeChildren(
  items: (ApiCollection | ApiRequest)[],
  nodeId: string,
  updater: (children: (ApiCollection | ApiRequest)[]) => (ApiCollection | ApiRequest)[],
): (ApiCollection | ApiRequest)[] {
  return items.map((item) => {
    if (!('children' in item)) return item
    if (item.id === nodeId) {
      return { ...item, children: updater(item.children) }
    }
    return { ...item, children: updateNodeChildren(item.children, nodeId, updater) }
  })
}

function updateRequestInTree(
  items: (ApiCollection | ApiRequest)[],
  requestId: string,
  updater: (request: ApiRequest) => ApiRequest,
): (ApiCollection | ApiRequest)[] {
  return items.map((item) => {
    if ('children' in item) {
      return { ...item, children: updateRequestInTree(item.children, requestId, updater) }
    }
    return item.id === requestId ? updater(item) : item
  })
}

function removeNode(items: (ApiCollection | ApiRequest)[], id: string): (ApiCollection | ApiRequest)[] {
  return items
    .filter((item) => item.id !== id)
    .map((item) => ('children' in item ? { ...item, children: removeNode(item.children, id) } : item))
}

export default function ApiDebugPage() {
  const [config, setConfig] = useState<ApiGlobalConfig>({
    globalHeaders: [], environments: [], activeEnvId: null, collections: [], historyLimit: 100,
  })
  const [request, setRequest] = useState<ApiRequest>(createDefaultRequest)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const msg = useMessage()
  const [envOpen, setEnvOpen] = useState(false)
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null)
  const [isWsMode, setIsWsMode] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [dividerHover, setDividerHover] = useState(false)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const onDividerDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startX.current = e.clientX
    startWidth.current = sidebarWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const delta = ev.clientX - startX.current
      setSidebarWidth(Math.max(180, Math.min(500, startWidth.current + delta)))
    }
    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [sidebarWidth])

  const { loading, response, error, send } = useApiRequest()

  useEffect(() => {
    bridge.getApiConfig().then((c) => {
      setConfig({
        globalHeaders: c.globalHeaders || [],
        environments: c.environments || [],
        activeEnvId: c.activeEnvId,
        collections: c.collections || [],
        historyLimit: c.historyLimit || 100,
      })
    }).catch(() => {})
  }, [])

  const saveConfig = useCallback(async (patch: Partial<ApiGlobalConfig>) => {
    const next = { ...config, ...patch }
    setConfig(next)
    try { await bridge.saveApiConfig(next) } catch {}
  }, [config])

  const handleRequestChange = useCallback((next: ApiRequest) => {
    setRequest(next)
    if (!activeRequestId) return
    const collections = updateRequestInTree(config.collections, activeRequestId, () => ({ ...next })) as ApiCollection[]
    saveConfig({ collections })
  }, [activeRequestId, config.collections, saveConfig])

  const handleSend = useCallback(async () => {
    if (!request.url) {
      msg.warning('请输入 URL')
      return
    }
    if (request.url.startsWith('ws://') || request.url.startsWith('wss://')) {
      setIsWsMode(true)
      return
    }
    setIsWsMode(false)
    const resp = await send(request, config, config.activeEnvId)
    if (resp) {
      setHistory((prev) => {
        const entry: HistoryEntry = {
          id: generateId(),
          timestamp: Date.now(),
          request: { ...request },
          response: resp,
          usedEnvId: config.activeEnvId,
        }
        return [entry, ...prev].slice(0, config.historyLimit)
      })
    }
  }, [request, config, send])

  const handleAddCollection = useCallback((name: string) => {
    const col: ApiCollection = { id: generateId(), name, children: [], headers: [] }
    saveConfig({ collections: [...config.collections, col] })
  }, [config.collections, saveConfig])

  const handleAddFolder = useCallback((parentId: string, name: string) => {
    const folder: ApiCollection = { id: generateId(), name, children: [], headers: [] }
    const collections = updateNodeChildren(config.collections, parentId, (children) => [...children, folder]) as ApiCollection[]
    saveConfig({ collections })
  }, [config.collections, saveConfig])

  const handleAddRequest = useCallback((parentId: string, name: string) => {
    const nextRequest = createDefaultRequest(name || '新请求')
    const collections = updateNodeChildren(config.collections, parentId, (children) => [...children, nextRequest]) as ApiCollection[]
    setRequest(nextRequest)
    setActiveRequestId(nextRequest.id)
    saveConfig({ collections })
  }, [config.collections, saveConfig])

  const handleDeleteItem = useCallback((id: string) => {
    const collections = removeNode(config.collections, id) as ApiCollection[]
    if (activeRequestId === id) {
      setRequest(createDefaultRequest())
      setActiveRequestId(null)
    }
    saveConfig({ collections })
  }, [activeRequestId, config.collections, saveConfig])

  const handleRenameItem = useCallback((id: string, name: string) => {
    const renameIn = (items: (ApiCollection | ApiRequest)[]): (ApiCollection | ApiRequest)[] =>
      items.map((item) => {
        if ('children' in item) {
          if (item.id === id) return { ...item, name }
          return { ...item, children: renameIn(item.children) }
        }
        return item.id === id ? { ...item, name } : item
      })
    const collections = renameIn(config.collections) as ApiCollection[]
    if (activeRequestId === id) setRequest((r) => ({ ...r, name }))
    saveConfig({ collections })
  }, [activeRequestId, config.collections, saveConfig])

  const handleSelectRequest = useCallback((id: string) => {
    const found = findRequestById(config.collections, id)
    if (!found) return
    setRequest({ ...found })
    setActiveRequestId(id)
  }, [config.collections])

  const mergedHeaders = useMemo(() => {
    const result: { key: string; value: string; source: '请求级' | '环境' | '集合' | '全局' }[] = []

    const addAll = (items: ApiKvPair[] | null | undefined, source: '请求级' | '环境' | '集合' | '全局') => {
      if (items) items.filter(i => i.enabled && i.key).forEach(i => result.push({ key: i.key, value: i.value, source }))
    }

    addAll(config.globalHeaders, '全局')
    if (config.activeEnvId) {
      const env = config.environments.find(e => e.id === config.activeEnvId)
      if (env) addAll(env.headers, '环境')
    }
    addAll(request.headers, '请求级')
    return result
  }, [config, request.headers])

  if (isWsMode) {
    return (
      <PageShell title={<><ApiOutlined style={{ color: 'var(--color-primary)', marginRight: 8 }} />API 调试器</>}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <UrlBar
            method={request.method}
            url={request.url}
            environments={config.environments}
            activeEnvId={config.activeEnvId}
            onMethodChange={(m) => handleRequestChange({ ...request, method: m })}
            onUrlChange={(url) => handleRequestChange({ ...request, url })}
            onEnvChange={(id) => saveConfig({ activeEnvId: id })}
            onSend={() => {}}
            loading={false}
          />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <WebSocketPanel url={request.url} />
          </div>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell
      title={<><ApiOutlined style={{ color: 'var(--color-primary)', marginRight: 8 }} />API 调试器</>}
      actions={
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="small" icon={<SettingOutlined />} onClick={() => setEnvOpen(true)}>环境</Button>
          <Dropdown menu={{
            items: [
              { key: 'import', icon: <CloudUploadOutlined />, label: '导入 Postman Collection', onClick: () => {
                bridge.selectFile('选择 Postman Collection (.json)').then(async (path) => {
                  if (!path) return
                  try {
                    const text = await bridge.readTextFile(path)
                    const result = importPostmanCollection(text)
                    const newCol: ApiCollection = { id: generateId(), name: result.name, children: result.requests, headers: [] }
                    saveConfig({ collections: [...config.collections, newCol] })
                    msg.success(`已导入 ${result.requests.length} 个请求`)
                  } catch (err: any) {
                    msg.error('导入失败: ' + err.message)
                  }
                }).catch(() => {})
              }},
              { key: 'export', icon: <CloudDownloadOutlined />, label: '导出 Postman Collection', onClick: async () => {
                const path = await bridge.selectSaveFile('保存为 Postman Collection')
                if (path) {
                  const json = exportPostmanCollection(config.collections)
                  await bridge.writeTextFile(path, json)
                  msg.success('导出成功')
                }
              }},
            ],
          }}>
            <Button size="small" icon={<CloudDownloadOutlined />}>导入/导出</Button>
          </Dropdown>
        </div>
      }
    >
      <div style={styles.layout}>
        <div style={{ ...styles.sidebar, width: sidebarWidth, minWidth: sidebarWidth }}>
          <CollectionTree
            collections={config.collections}
            activeRequestId={activeRequestId}
            onSelectRequest={handleSelectRequest}
            onAddCollection={handleAddCollection}
            onAddFolder={handleAddFolder}
            onAddRequest={handleAddRequest}
            onDeleteItem={handleDeleteItem}
            onRenameItem={handleRenameItem}
          />
        </div>
        <div
          style={{ ...styles.divider, background: dividerHover ? 'var(--color-primary)' : 'transparent', transition: 'background 0.15s' }}
          onMouseDown={onDividerDown}
          onMouseEnter={() => setDividerHover(true)}
          onMouseLeave={() => setDividerHover(false)}
        />
        <div style={styles.main}>
          <SectionCard title="请求" fill>
            <UrlBar
              method={request.method}
              url={request.url}
              environments={config.environments}
              activeEnvId={config.activeEnvId}
              onMethodChange={(m) => handleRequestChange({ ...request, method: m })}
              onUrlChange={(url) => handleRequestChange({ ...request, url })}
              onEnvChange={(id) => saveConfig({ activeEnvId: id })}
              onSend={handleSend}
              loading={loading}
            />
            <RequestPanel request={request} onChange={handleRequestChange} />
            <div style={{ padding: '4px 0' }}>
              <HeaderPreview merged={mergedHeaders} />
            </div>
          </SectionCard>

          <SectionCard title="响应" fill style={{ borderTop: '0.5px solid var(--color-border)' }}>
            <ResponsePanel response={response} loading={loading} error={error} />
          </SectionCard>
        </div>
      </div>

      <EnvManager
        open={envOpen}
        environments={config.environments}
        onClose={() => setEnvOpen(false)}
        onSave={(envs) => saveConfig({ environments: envs })}
      />
    </PageShell>
  )
}

const styles: Record<string, React.CSSProperties> = {
  layout: { display: 'flex', height: '100%', overflow: 'hidden' },
  sidebar: { display: 'flex', flexDirection: 'column', borderRight: 'none', background: 'var(--color-bg-2)' },
  divider: { width: 4, cursor: 'col-resize', flexShrink: 0, zIndex: 10, position: 'relative' as const },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, borderLeft: '0.5px solid var(--color-border)' },
}
