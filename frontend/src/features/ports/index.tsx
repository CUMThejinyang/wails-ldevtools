import { useState, useCallback, useEffect } from 'react'
import { Alert } from 'antd'
import { ApiOutlined } from '@ant-design/icons'
import PageShell from '@/components/layout/PageShell'
import Toolbar, { type ToolbarFilter } from './components/Toolbar'
import PortTable from './components/PortTable'
import { usePorts } from './hooks/usePorts'
import { bridge } from '@/services/bridge'
import type { PortViewerPrefs } from '@/types'

const DEFAULT_FILTER: ToolbarFilter = {
  portKeyword: '',
  pidKeyword: '',
  processKeyword: '',
  protocol: 'ALL',
  family: 'ALL',
  states: [],
}

export default function PortsPage() {
  const { data, loading, error, refresh, pollingInterval, setPollingInterval } = usePorts()
  const [filter, setFilter] = useState<ToolbarFilter>(DEFAULT_FILTER)
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])
  const [selectedPids, setSelectedPids] = useState<number[]>([])

  // Load saved prefs into filter on mount
  useEffect(() => {
    bridge.getPortViewerPrefs().then((prefs: PortViewerPrefs) => {
      setFilter(f => ({
        ...f,
        protocol: prefs.protocol && prefs.protocol !== 'all' ? prefs.protocol.toUpperCase() : f.protocol,
        family: prefs.family && prefs.family !== 'all' ? prefs.family : f.family,
        states: prefs.states?.length ? prefs.states : f.states,
      }))
      if (prefs.pollInterval > 0) {
        setPollingInterval(prefs.pollInterval)
      }
    }).catch(() => {})
  }, [setPollingInterval])

  const handleFilterChange = useCallback((f: ToolbarFilter) => {
    setFilter(f)
  }, [])

  const handlePollingChange = useCallback((ms: number) => {
    setPollingInterval(ms)
    bridge.savePortViewerPrefs({
      pollInterval: ms,
      protocol: filter.protocol.toLowerCase(),
      family: filter.family.toLowerCase(),
      states: filter.states,
    }).catch(() => {})
  }, [setPollingInterval, filter])

  const handleKillDone = useCallback(() => {
    setSelectedRowKeys([])
    setSelectedPids([])
    refresh()
  }, [refresh])

  return (
    <PageShell title={<><ApiOutlined style={{ color: 'var(--color-primary)', marginRight: 8 }} />端口占用</>}>
      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          closable
          style={{ margin: '0 12px', flexShrink: 0 }}
        />
      )}
      <Toolbar
        loading={loading}
        data={data}
        selectedPids={selectedPids}
        pollingInterval={pollingInterval}
        filter={filter}
        onPollingChange={handlePollingChange}
        onRefresh={refresh}
        onFilterChange={handleFilterChange}
        onKillDone={handleKillDone}
      />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 12px 12px' }}>
        <PortTable
          data={data}
          loading={loading}
          filter={filter}
          selectedRowKeys={selectedRowKeys}
          onSelectedRowKeysChange={setSelectedRowKeys}
          onSelectedPidsChange={setSelectedPids}
          onKillDone={handleKillDone}
        />
      </div>
    </PageShell>
  )
}
