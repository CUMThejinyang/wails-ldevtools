import { useState } from 'react'
import { Tabs, Select } from 'antd'
import KvEditor from './KvEditor'
import type { ApiRequest, ApiKvPair, ApiBodyType } from '@/types'

interface RequestPanelProps {
  request: ApiRequest
  onChange: (req: ApiRequest) => void
}

export default function RequestPanel({ request, onChange }: RequestPanelProps) {
  const update = (patch: Partial<ApiRequest>) => onChange({ ...request, ...patch })

  const [bodyType, setBodyType] = useState<ApiBodyType>(request.body?.type || 'none')

  const handleBodyTypeChange = (t: ApiBodyType) => {
    setBodyType(t)
    onChange({
      ...request,
      body: { type: t, jsonContent: '', formItems: [], urlencodedItems: [], rawContent: '', rawContentType: '' },
    })
  }

  const renderBodyEditor = () => {
    if (bodyType === 'none') return <div style={{ padding: 12, color: 'var(--color-text-3)' }}>此请求无请求体</div>
    if (bodyType === 'json') {
      return (
        <textarea
          style={styles.textarea}
          value={request.body?.jsonContent || ''}
          onChange={(e) => update({ body: { ...request.body!, jsonContent: e.target.value } })}
          placeholder='{"key": "value"}'
        />
      )
    }
    if (bodyType === 'form-data') {
      return (
        <KvEditor
          items={request.body?.formItems?.map(f => ({ key: f.key, value: f.value, enabled: f.enabled })) || []}
          onChange={(items) => update({ body: { ...request.body!, formItems: items as any } })}
          keyPlaceholder="字段名"
          valuePlaceholder="值或文件路径"
        />
      )
    }
    if (bodyType === 'urlencoded') {
      return (
        <KvEditor
          items={request.body?.urlencodedItems || []}
          onChange={(items) => update({ body: { ...request.body!, urlencodedItems: items } })}
          keyPlaceholder="参数名"
          valuePlaceholder="参数值"
        />
      )
    }
    // raw
    return (
      <div style={styles.rawContainer}>
        <input
          style={styles.rawContentType}
          value={request.body?.rawContentType || ''}
          onChange={(e) => update({ body: { ...request.body!, rawContentType: e.target.value } })}
          placeholder="Content-Type (e.g. application/xml)"
        />
        <textarea
          style={{ ...styles.textarea, flex: 1 }}
          value={request.body?.rawContent || ''}
          onChange={(e) => update({ body: { ...request.body!, rawContent: e.target.value } })}
          placeholder="原始请求体内容..."
        />
      </div>
    )
  }

  const authContent = (
    <div style={styles.authContainer}>
      <Select
        value={request.auth?.type || 'none'}
        onChange={(t) => update({ auth: { type: t as 'none' | 'bearer' | 'basic' } })}
        size="small"
        style={{ width: 160 }}
        options={[
          { value: 'none', label: 'No Auth' },
          { value: 'bearer', label: 'Bearer Token' },
          { value: 'basic', label: 'Basic Auth' },
        ]}
      />
      {request.auth?.type === 'bearer' && (
        <input
          style={styles.authInput}
          value={request.auth.token || ''}
          onChange={(e) => update({ auth: { ...request.auth!, token: e.target.value } })}
          placeholder="输入 Token..."
        />
      )}
      {(request.auth?.type === 'basic') && (
        <div style={styles.basicRow}>
          <input style={styles.authInput} value={request.auth?.username || ''} onChange={(e) => update({ auth: { ...request.auth!, username: e.target.value } })} placeholder="用户名" />
          <input style={styles.authInput} value={request.auth?.password || ''} onChange={(e) => update({ auth: { ...request.auth!, password: e.target.value } })} placeholder="密码" type="password" />
        </div>
      )}
    </div>
  )

  return (
    <Tabs
      size="small"
      items={[
        {
          key: 'params',
          label: 'Params',
          children: (
            <KvEditor
              items={request.params}
              onChange={(items) => update({ params: items })}
              keyPlaceholder="参数名"
              valuePlaceholder="参数值"
            />
          ),
        },
        {
          key: 'headers',
          label: 'Headers',
          children: (
            <KvEditor
              items={request.headers}
              onChange={(items) => update({ headers: items })}
              keyPlaceholder="Header 名"
              valuePlaceholder="Header 值"
              showDescription
            />
          ),
        },
        {
          key: 'body',
          label: 'Body',
          children: (
            <div style={styles.bodyContainer}>
              <Select
                value={bodyType}
                onChange={handleBodyTypeChange}
                size="small"
                style={{ width: 160, marginBottom: 8 }}
                options={[
                  { value: 'none', label: 'none' },
                  { value: 'json', label: 'JSON' },
                  { value: 'form-data', label: 'form-data' },
                  { value: 'urlencoded', label: 'x-www-form-urlencoded' },
                  { value: 'raw', label: 'Raw' },
                ]}
              />
              {renderBodyEditor()}
            </div>
          ),
        },
        { key: 'auth', label: 'Auth', children: authContent },
      ]}
    />
  )
}

const styles: Record<string, React.CSSProperties> = {
  bodyContainer: { display: 'flex', flexDirection: 'column' },
  textarea: { width: '100%', minHeight: 100, background: 'var(--color-bg-1)', border: '1px solid var(--color-border)', color: 'var(--color-text-1)', borderRadius: 4, padding: 8, fontFamily: 'var(--code-font-family)', fontSize: 13, resize: 'vertical' },
  rawContainer: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 120 },
  rawContentType: { background: 'var(--color-bg-1)', border: '1px solid var(--color-border)', color: 'var(--color-text-1)', borderRadius: 4, padding: '4px 8px', fontFamily: 'var(--code-font-family)', fontSize: 12 },
  authContainer: { display: 'flex', flexDirection: 'column', gap: 8, padding: 8 },
  authInput: { background: 'var(--color-bg-1)', border: '1px solid var(--color-border)', color: 'var(--color-text-1)', borderRadius: 4, padding: '4px 8px', fontFamily: 'var(--code-font-family)', fontSize: 13, width: '100%' },
  basicRow: { display: 'flex', gap: 8 },
}
