import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Button, Modal, Input, theme } from 'antd'
import { PlusOutlined, FolderAddOutlined, FileAddOutlined, DeleteOutlined, RightOutlined, SearchOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { useModal } from '@/hooks/useMessage'
import type { ApiCollection } from '@/types'

const nodeStyles = `
.ctree-node {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 4px;
  font-size: 12px;
  line-height: 22px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-radius: 4px;
  margin: 0 4px;
  user-select: none;
}
.ctree-node--request {
  cursor: pointer;
}
.ctree-node:hover {
  background: rgba(100,160,255,0.18);
}
.ctree-node--active {
  background: rgba(100,160,255,0.25) !important;
}
.ctree-node:hover .ctree-actions {
  opacity: 1;
}
.ctree-actions {
  opacity: 0;
  transition: opacity 0.15s;
}
.ctree-rename-input {
  font-size: 12px;
  line-height: 22px;
  background: var(--color-bg-1);
  border: 1px solid var(--color-primary);
  border-radius: 3px;
  color: var(--color-text-1);
  outline: none;
  padding: 0 4px;
  flex: 1;
  min-width: 0;
}
`

interface Props {
  collections: ApiCollection[]
  activeRequestId: string | null
  onSelectRequest: (id: string) => void
  onAddCollection: (name: string) => void
  onAddFolder: (parentId: string, name: string) => void
  onAddRequest: (parentId: string, name: string) => void
  onDeleteItem: (id: string) => void
  onRenameItem: (id: string, name: string) => void
}

export default function CollectionTree({ collections, activeRequestId, onSelectRequest, onAddCollection, onAddFolder, onAddRequest, onDeleteItem, onRenameItem }: Props) {
  const modal = useModal()
  const { token } = theme.useToken()
  const modalStyles = { content: { background: token.colorBgElevated }, header: { background: token.colorBgElevated }, body: { background: token.colorBgElevated }, footer: { background: token.colorBgElevated } }
  const [showNewCol, setShowNewCol] = useState(false)
  const [newColName, setNewColName] = useState('')
  const [folderModal, setFolderModal] = useState<{ open: boolean; parentId: string | null }>({ open: false, parentId: null })
  const [requestModal, setRequestModal] = useState<{ open: boolean; parentId: string | null }>({ open: false, parentId: null })
  const [folderName, setFolderName] = useState('')
  const [requestName, setRequestName] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [searchText, setSearchText] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)

  const keyword = searchText.trim().toLowerCase()

  // Filter tree: keep items whose name/url/method matches, or whose descendants match
  const filteredCollections = useMemo(() => {
    if (!keyword) return collections
    const filter = (items: (ApiCollection | any)[]): (ApiCollection | any)[] => {
      const result: (ApiCollection | any)[] = []
      for (const item of items) {
        if ('children' in item) {
          const childMatch = filter(item.children)
          const selfMatch = item.name.toLowerCase().includes(keyword)
          if (selfMatch || childMatch.length > 0) {
            result.push({ ...item, children: childMatch })
          }
        } else {
          const name = (item.name || item.url || '').toLowerCase()
          const method = (item.method || '').toLowerCase()
          if (name.includes(keyword) || method.includes(keyword)) {
            result.push(item)
          }
        }
      }
      return result
    }
    return filter(collections)
  }, [collections, keyword])

  // Auto-expand all when searching
  const expandedIdsWithSearch = useMemo(() => {
    if (!keyword) return expandedIds
      const allFolderIds = new Set<string>()
    const collect = (items: (ApiCollection | any)[]) => {
      for (const item of items) {
        if ('children' in item) {
          allFolderIds.add(item.id)
          collect(item.children)
        }
      }
    }
    collect(filteredCollections)
    return allFolderIds
  }, [keyword, filteredCollections, expandedIds])

  useEffect(() => {
    if (renamingId && renameRef.current) renameRef.current.focus()
  }, [renamingId])

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const startRename = useCallback((id: string, currentName: string) => {
    setRenamingId(id)
    setRenameValue(currentName)
  }, [])

  const commitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      onRenameItem(renamingId, renameValue.trim())
    }
    setRenamingId(null)
    setRenameValue('')
  }, [renamingId, renameValue, onRenameItem])

  const handleCreateCollection = () => {
    if (!newColName.trim()) return
    onAddCollection(newColName.trim())
    setNewColName('')
    setShowNewCol(false)
  }

  const handleCreateFolder = () => {
    if (!folderModal.parentId || !folderName.trim()) return
    onAddFolder(folderModal.parentId, folderName.trim())
    setFolderName('')
    setFolderModal({ open: false, parentId: null })
  }

  const handleCreateRequest = () => {
    if (!requestModal.parentId) return
    onAddRequest(requestModal.parentId, requestName.trim() || '新请求')
    setRequestName('')
    setRequestModal({ open: false, parentId: null })
  }

  const openDeleteConfirm = (id: string) => {
    modal.confirm({
      title: '确认删除',
      content: '删除后不可恢复。',
      okText: '删除',
      cancelText: '取消',
      centered: true,
      okButtonProps: { danger: true },
      styles: modalStyles,
      onOk: () => onDeleteItem(id),
    })
  }

  const renderTree = (items: (ApiCollection | any)[], level: number): React.ReactNode => {
    return items.map((item) => {
      if ('children' in item) {
        const expanded = expandedIdsWithSearch.has(item.id)
        const isRenaming = renamingId === item.id
        return (
          <div key={item.id}>
            <div className="ctree-node" style={{ paddingLeft: 4 + level * 16 }}>
              <span
                style={{ ...styles.arrow, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                onClick={() => toggleExpand(item.id)}
              >
                <RightOutlined />
              </span>
              <ThunderboltOutlined style={{ color: '#64a0ff', fontSize: 13, flexShrink: 0 }} />
              {isRenaming ? (
                <input
                  ref={renameRef}
                  className="ctree-rename-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setRenamingId(null); setRenameValue('') } }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span style={styles.nodeName} onDoubleClick={() => startRename(item.id, item.name)} onClick={() => toggleExpand(item.id)}>{item.name}</span>
              )}
              <div className="ctree-actions" style={styles.nodeActions}>
                <span style={styles.addBtn} onClick={() => setRequestModal({ open: true, parentId: item.id })}><FileAddOutlined /></span>
                <span style={styles.addBtn} onClick={() => setFolderModal({ open: true, parentId: item.id })}><FolderAddOutlined /></span>
                <span style={styles.delBtn} onClick={() => openDeleteConfirm(item.id)}><DeleteOutlined /></span>
              </div>
            </div>
            {expanded && item.children && item.children.length > 0 && renderTree(item.children, level + 1)}
          </div>
        )
      }
      const isActive = activeRequestId === item.id
      const isRenaming = renamingId === item.id
      return (
        <div
          key={item.id}
          className={`ctree-node ctree-node--request${isActive ? ' ctree-node--active' : ''}`}
          style={{ paddingLeft: 24 + level * 16 }}
          onClick={() => onSelectRequest(item.id)}
        >
          <span style={{ ...styles.method, color: GET_METHOD_COLOR(item.method) }}>{item.method}</span>
          {isRenaming ? (
            <input
              ref={renameRef}
              className="ctree-rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setRenamingId(null); setRenameValue('') } }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span style={styles.reqName} onDoubleClick={() => startRename(item.id, item.name || '')}>{item.name || item.url || '新请求'}</span>
          )}
          <div className="ctree-actions" style={styles.nodeActions} onClick={(e) => e.stopPropagation()}>
            <span style={styles.delBtn} onClick={() => openDeleteConfirm(item.id)}><DeleteOutlined /></span>
          </div>
        </div>
      )
    })
  }

  return (
    <div style={styles.container}>
      <style>{nodeStyles}</style>
      <div style={styles.header}>
        <span style={styles.title}>集合</span>
        <Button type="text" size="small" icon={<PlusOutlined style={{ color: '#00b96b' }} />} onClick={() => setShowNewCol(true)} />
      </div>
      <div style={styles.searchWrap}>
        <Input
          size="small"
          placeholder="搜索..."
          prefix={<SearchOutlined style={{ color: 'var(--color-text-3)', fontSize: 11 }} />}
          allowClear
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={styles.searchInput}
        />
      </div>
      <div style={styles.tree}>
        {filteredCollections.length === 0 ? (
          <div style={styles.empty}>{collections.length === 0 ? '暂无集合，点击 + 创建' : '无匹配结果'}</div>
        ) : renderTree(filteredCollections, 0)}
      </div>

      <Modal title="新建集合" open={showNewCol} styles={modalStyles} getContainer={false} onOk={handleCreateCollection} onCancel={() => { setShowNewCol(false); setNewColName('') }}>
        <Input value={newColName} onChange={(e) => setNewColName(e.target.value)} placeholder="集合名称" onPressEnter={handleCreateCollection} />
      </Modal>

      <Modal title="新建文件夹" open={folderModal.open} styles={modalStyles} getContainer={false} onOk={handleCreateFolder} onCancel={() => { setFolderModal({ open: false, parentId: null }); setFolderName('') }}>
        <Input value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="文件夹名称" onPressEnter={handleCreateFolder} />
      </Modal>

      <Modal title="新建请求" open={requestModal.open} styles={modalStyles} getContainer={false} onOk={handleCreateRequest} onCancel={() => { setRequestModal({ open: false, parentId: null }); setRequestName('') }}>
        <Input value={requestName} onChange={(e) => setRequestName(e.target.value)} placeholder="请求名称" onPressEnter={handleCreateRequest} />
      </Modal>
    </div>
  )
}

function GET_METHOD_COLOR(m: string): string {
  const map: Record<string, string> = { GET: '#61affe', POST: '#49cc90', PUT: '#fca130', DELETE: '#f93e3e', PATCH: '#50e3c2', HEAD: '#9012fe', OPTIONS: '#0d5aa7' }
  return map[m] || '#aaa'
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', borderBottom: '1px solid var(--color-border)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 6px', borderBottom: '1px solid var(--color-border)' },
  title: { fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)' },
  searchWrap: { padding: '2px 6px 4px' },
  searchInput: { fontSize: 11, borderRadius: 4 },
  tree: { overflow: 'auto', flex: 1 },
  empty: { padding: 12, textAlign: 'center', color: 'var(--color-text-3)', fontSize: 12 },
  nodeName: { overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--color-text-1)', cursor: 'pointer' },
  nodeActions: { marginLeft: 'auto', display: 'flex', gap: 2, flexShrink: 0, alignItems: 'center' },
  addBtn: { cursor: 'pointer', fontSize: 13, color: '#00b96b', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 3 },
  delBtn: { cursor: 'pointer', fontSize: 13, color: '#f93e3e', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 3 },
  method: { fontSize: 10, fontWeight: 700, width: 42, flexShrink: 0 },
  reqName: { overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--color-text-1)', flex: 1, cursor: 'text' },
  arrow: { fontSize: 9, color: 'var(--color-text-3)', cursor: 'pointer', width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'transform 0.15s ease' },
}
