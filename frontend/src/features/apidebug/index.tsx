import { useState, useEffect, useCallback, useMemo } from 'react'
import { ApiOutlined, SettingOutlined, CloudUploadOutlined, CloudDownloadOutlined } from '@ant-design/icons'
import { Button, Dropdown, message } from 'antd'
import PageShell from '@/components/layout/PageShell'
import SectionCard from '@/components/layout/SectionCard'
import { bridge, generateId } from '@/services/bridge'
import type { ApiRequest, ApiGlobalConfig, ApiCollection, ApiKvPair, HistoryEntry, ResponseSnapshot } from '@/types'
import { useApiRequest } from './hooks/useApiRequest'
import UrlBar from './components/UrlBar'
import RequestPanel from './components/RequestPanel'
import ResponsePanel from './components/ResponsePanel'
import CollectionTree from './components/CollectionTree'
import HistoryList from './components/HistoryList'
import EnvManager from './components/EnvManager'
import HeaderPreview from './components/HeaderPreview'
import WebSocketPanel from './components/WebSocketPanel'
import { importPostmanCollection, exportPostmanCollection } from './utils/import-export'

function createDefaultRequest(): ApiRequest {
  return {
    id: generateId(),
    name: '',
    method: 'GET',
    url: '',
    params: [],
    headers: [],
    body: { type: 'none' },
    auth: { type: 'none' },
  }
}

export default function ApiDebugPage() {
  const [config, setConfig] = useState<ApiGlobalConfig>({
    globalHeaders: [], environments: [], activeEnvId: null, collections: [], historyLimit: 100,
  })
  const [request, setRequest] = useState<ApiRequest>(createDefaultRequest)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [envOpen, setEnvOpen] = useState(false)
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null)
  const [isWsMode, setIsWsMode] = useState(false)

  const { loading, response, error, send } = useApiRequest()

  // 加载配置
  useEffect(() => {
    bridge.getApiConfig().then((c) => {
      setConfig(c)
    }).catch(() => {})
  }, [])

  // 发送请求
  const handleSend = useCallback(async () => {
    if (!request.url) {
      message.warning('请输入 URL')
      return
    }
    if (request.url.startsWith('ws://') || request.url.startsWith('wss://')) {
      setIsWsMode(true)
      return
    }
    setIsWsMode(false)
    const resp = await send(request, config, config.activeEnvId)
    // 使用 send 返回的最新 response 保存历史
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

  // 保存配置
  const saveConfig = useCallback(async (patch: Partial<ApiGlobalConfig>) => {
    const next = { ...config, ...patch }
    setConfig(next)
    try { await bridge.saveApiConfig(next) } catch {}
  }, [config])

  // 集合操作
  const handleAddCollection = useCallback((name: string) => {
    const col: ApiCollection = { id: generateId(), name, children: [], headers: [] }
    saveConfig({ collections: [...config.collections, col] })
  }, [config, saveConfig])

  // 保存当前请求到集合
  const handleSaveToCollection = useCallback(() => {
    if (config.collections.length === 0) {
      message.warning('请先创建集合')
      return
    }
    const firstCol = config.collections[0]
    const savedReq = { ...request, id: generateId(), name: request.name || request.url }
    const updatedCollections = config.collections.map((c) => {
      if (c.id === firstCol.id) {
        return { ...c, children: [...c.children, savedReq] }
      }
      return c
    })
    saveConfig({ collections: updatedCollections })
    message.success('已保存到集合')
  }, [request, config, saveConfig])

  // 从集合加载请求
  const handleSelectRequest = useCallback((id: string) => {
    const findReq = (items: (ApiCollection | ApiRequest)[]): ApiRequest | null => {
      for (const item of items) {
        if ('children' in item) {
          const found = findReq(item.children)
          if (found) return found
        } else if (item.id === id) {
          return item
        }
      }
      return null
    }
    const found = findReq(config.collections)
    if (found) {
      setRequest({ ...found })
      setActiveRequestId(id)
    }
  }, [config.collections])

  // Header 合并预览
  const mergedHeaders = useMemo(() => {
    const result: { key: string; value: string; source: '请求级' | '环境' | '集合' | '全局' }[] = []

    const addAll = (items: ApiKvPair[], source: '请求级' | '环境' | '集合' | '全局') => {
      items.filter(i => i.enabled && i.key).forEach(i => result.push({ key: i.key, value: i.value, source }))
    }

    addAll(config.globalHeaders, '全局')
    if (config.activeEnvId) {
      const env = config.environments.find(e => e.id === config.activeEnvId)
      if (env) addAll(env.headers, '环境')
    }
    addAll(request.headers, '请求级')
    if (request.auth?.type === 'bearer' && request.auth.token) {
      result.push({ key: 'Authorization', value: `Bearer ${request.auth.token}`, source: '请求级' })
    }
    return result
  }, [config, request])

  // WebSocket 模式
  if (isWsMode) {
    return (
      <PageShell title={<><ApiOutlined style={{ color: 'var(--color-primary)', marginRight: 8 }} />API 调试器</>}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <UrlBar
            method={request.method}
            url={request.url}
            envNames={config.environments.map(e => e.name)}
            activeEnvId={config.activeEnvId}
            onMethodChange={(m) => setRequest(r => ({ ...r, method: m }))}
            onUrlChange={(url) => setRequest(r => ({ ...r, url }))}
            onEnvChange={(id) => saveConfig({ activeEnvId: id })}
            onSend={() => {}}
            onSave={() => {}}
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
                    message.success(`已导入 ${result.requests.length} 个请求`)
                  } catch (err: any) {
                    message.error('导入失败: ' + err.message)
                  }
                }).catch(() => {})
              }},
              { key: 'export', icon: <CloudDownloadOutlined />, label: '导出 Postman Collection', onClick: async () => {
                const path = await bridge.selectSaveFile('保存为 Postman Collection')
                if (path) {
                  const json = exportPostmanCollection(config.collections)
                  await bridge.writeTextFile(path, json)
                  message.success('导出成功')
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
        <div style={styles.sidebar}>
          <CollectionTree
            collections={config.collections}
            activeRequestId={activeRequestId}
            onSelectRequest={handleSelectRequest}
            onAddCollection={handleAddCollection}
            onAddFolder={(parentId, name) => {
              const updateTree = (items: (ApiCollection | ApiRequest)[]): (ApiCollection | ApiRequest)[] =>
                items.map(item => {
                  if ('children' in item && item.id === parentId)
                    return { ...item, children: [...item.children, { id: generateId(), name, children: [], headers: [] }] }
                  if ('children' in item)
                    return { ...item, children: updateTree(item.children) }
                  return item
                })
              saveConfig({ collections: updateTree(config.collections) as ApiCollection[] })
            }}
            onDeleteItem={(id) => {
              const removeFrom = (items: (ApiCollection | ApiRequest)[]): (ApiCollection | ApiRequest)[] =>
                items.filter(item => {
                  if (item.id === id) return false
                  if ('children' in item) item.children = removeFrom(item.children)
                  return true
                })
              saveConfig({ collections: removeFrom(config.collections) as ApiCollection[] })
            }}
          />
          <HistoryList
            history={history}
            onSelect={(entry) => { setRequest({ ...entry.request }); setActiveRequestId(null) }}
            onClear={() => setHistory([])}
          />
        </div>
        <div style={styles.main}>
          <SectionCard title="请求" fill>
            <UrlBar
              method={request.method}
              url={request.url}
              envNames={config.environments.map(e => e.name)}
              activeEnvId={config.activeEnvId}
              onMethodChange={(m) => setRequest(r => ({ ...r, method: m }))}
              onUrlChange={(url) => setRequest(r => ({ ...r, url }))}
              onEnvChange={(id) => saveConfig({ activeEnvId: id })}
              onSend={handleSend}
              onSave={handleSaveToCollection}
              loading={loading}
            />
            <RequestPanel request={request} onChange={setRequest} />
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
  sidebar: { width: 240, minWidth: 240, display: 'flex', flexDirection: 'column', borderRight: '0.5px solid var(--color-border)', background: 'var(--color-bg-2)' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 },
}
