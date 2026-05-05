import Editor from '@monaco-editor/react'
import { Tabs, Select, Button } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import KvEditor from './KvEditor'
import { bridge } from '@/services/bridge'
import type { ApiRequest, ApiBodyType, ApiFormItem } from '@/types'

interface RequestPanelProps {
  request: ApiRequest
  onChange: (req: ApiRequest) => void
}

function isDarkMode() {
  return document.body.getAttribute('theme-mode') !== 'light'
}

export default function RequestPanel({ request, onChange }: RequestPanelProps) {
  const dark = isDarkMode()
  const update = (patch: Partial<ApiRequest>) => onChange({ ...request, ...patch })

  const handleBodyTypeChange = (t: ApiBodyType) => {
    onChange({
      ...request,
      body: { type: t, jsonContent: '', formItems: [], urlencodedItems: [], rawContent: '', rawContentType: '' },
    })
  }

  const updateFormItem = (index: number, patch: Partial<ApiFormItem>) => {
    const next = (request.body?.formItems || []).map((item, i) => {
      if (i !== index) return item
      return { ...item, ...patch, filePath: patch.type === 'file' ? (patch.filePath ?? patch.value ?? item.filePath ?? item.value) : undefined }
    })
    update({ body: { ...request.body!, formItems: next } })
  }

  const addFormItem = () => {
    const next = [...(request.body?.formItems || []), { key: '', value: '', enabled: true, type: 'text' as const }]
    update({ body: { ...request.body!, formItems: next } })
  }

  const removeFormItem = (index: number) => {
    const next = (request.body?.formItems || []).filter((_, i) => i !== index)
    update({ body: { ...request.body!, formItems: next } })
  }

  const pickFile = async (index: number) => {
    const path = await bridge.selectFile('选择上传文件')
    if (!path) return
    updateFormItem(index, { type: 'file', value: path, filePath: path })
  }

  const renderFormDataEditor = () => {
    const items = request.body?.formItems || []
    return (
      <div style={styles.formDataWrap}>
        {items.map((item, index) => (
          <div key={index} style={styles.formDataRow}>
            <input
              type="checkbox"
              checked={item.enabled}
              onChange={(e) => updateFormItem(index, { enabled: e.target.checked })}
            />
            <input
              style={styles.formInputKey}
              value={item.key}
              onChange={(e) => updateFormItem(index, { key: e.target.value })}
              placeholder="字段名"
            />
            <Select
              size="small"
              value={item.type || 'text'}
              onChange={(value) => updateFormItem(index, { type: value, filePath: value === 'file' ? item.filePath || item.value : undefined })}
              style={{ width: 88 }}
              options={[{ value: 'text', label: '文本' }, { value: 'file', label: '文件' }]}
            />
            <input
              style={styles.formInputValue}
              value={item.type === 'file' ? (item.filePath || item.value || '') : item.value}
              onChange={(e) => updateFormItem(index, item.type === 'file' ? { value: e.target.value, filePath: e.target.value } : { value: e.target.value })}
              placeholder={item.type === 'file' ? '文件路径' : '字段值'}
            />
            {item.type === 'file' && (
              <Button size="small" onClick={() => pickFile(index)}>选择文件</Button>
            )}
            <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => removeFormItem(index)} />
          </div>
        ))}
        <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addFormItem} style={styles.addBtn}>添加</Button>
      </div>
    )
  }

  const renderBodyEditor = () => {
    const bodyType = request.body?.type || 'none'
    if (bodyType === 'none') return <div style={{ padding: 12, color: 'var(--color-text-3)' }}>此请求无请求体</div>
    if (bodyType === 'json') {
      return (
        <div style={styles.editorWrap}>
          <Editor
            height="220px"
            language="json"
            theme={dark ? 'vs-dark' : 'vs'}
            value={request.body?.jsonContent || ''}
            onChange={(value) => update({ body: { ...request.body!, jsonContent: value || '' } })}
            options={editorOptions}
          />
        </div>
      )
    }
    if (bodyType === 'form-data') {
      return renderFormDataEditor()
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
    return (
      <div style={styles.rawContainer}>
        <input
          style={styles.rawContentType}
          value={request.body?.rawContentType || ''}
          onChange={(e) => update({ body: { ...request.body!, rawContentType: e.target.value } })}
          placeholder="Content-Type (e.g. application/xml)"
        />
        <div style={styles.editorWrap}>
          <Editor
            height="220px"
            defaultLanguage="plaintext"
            theme={dark ? 'vs-dark' : 'vs'}
            value={request.body?.rawContent || ''}
            onChange={(value) => update({ body: { ...request.body!, rawContent: value || '' } })}
            options={editorOptions}
          />
        </div>
      </div>
    )
  }

  return (
    <Tabs
      size="small"
      style={styles.panel}
      items={[
        {
          key: 'params',
          label: '参数',
          children: (
            <div style={styles.tabContent}>
              <KvEditor
                items={request.params}
                onChange={(items) => update({ params: items })}
                keyPlaceholder="参数名"
                valuePlaceholder="参数值"
              />
            </div>
          ),
        },
        {
          key: 'headers',
          label: '请求头',
          children: (
            <div style={styles.tabContent}>
              <KvEditor
                items={request.headers}
                onChange={(items) => update({ headers: items })}
                keyPlaceholder="Header 名"
                valuePlaceholder="Header 值"
                showDescription
              />
            </div>
          ),
        },
        {
          key: 'body',
          label: '请求体',
          children: (
            <div style={styles.bodyContainer}>
              <Select
                value={request.body?.type || 'none'}
                onChange={handleBodyTypeChange}
                size="small"
                style={{ width: 160, marginBottom: 8 }}
                options={[
                  { value: 'none', label: '无' },
                  { value: 'json', label: 'JSON' },
                  { value: 'form-data', label: 'form-data' },
                  { value: 'urlencoded', label: 'x-www-form-urlencoded' },
                  { value: 'raw', label: 'Raw' },
                ]}
              />
              <div style={styles.tabContent}>
                {renderBodyEditor()}
              </div>
            </div>
          ),
        },
      ]}
    />
  )
}

const editorOptions = {
  minimap: { enabled: false },
  fontSize: 12,
  wordWrap: 'on' as const,
  scrollBeyondLastLine: false,
  automaticLayout: true,
}

const styles: Record<string, React.CSSProperties> = {
  panel: { display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  tabContent: { maxHeight: 'calc(50vh - 210px)', overflowY: 'auto', paddingRight: 2 },
  bodyContainer: { display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  editorWrap: { border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden' },
  rawContainer: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 120 },
  rawContentType: { background: 'var(--color-bg-1)', border: '1px solid var(--color-border)', color: 'var(--color-text-1)', borderRadius: 4, padding: '4px 8px', fontFamily: 'var(--code-font-family)', fontSize: 12 },
  formDataWrap: { display: 'flex', flexDirection: 'column', gap: 4 },
  formDataRow: { display: 'flex', alignItems: 'center', gap: 6 },
  formInputKey: { width: 180, background: 'var(--color-bg-1)', border: '1px solid var(--color-border)', color: 'var(--color-text-1)', borderRadius: 4, padding: '4px 8px', fontSize: 12 },
  formInputValue: { flex: 1, background: 'var(--color-bg-1)', border: '1px solid var(--color-border)', color: 'var(--color-text-1)', borderRadius: 4, padding: '4px 8px', fontSize: 12 },
  addBtn: { width: '100%', marginTop: 4 },
}
