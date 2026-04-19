import { Alert, Button, Input, InputNumber, Switch, Tooltip } from 'antd'
import { CaretRightOutlined, StopOutlined, SaveOutlined } from '@ant-design/icons'
import PathPicker from '@/components/form/PathPicker'
import type { LocalServerConfig } from '@/types'

interface Props {
  config: LocalServerConfig
  onChange: (patch: Partial<LocalServerConfig>) => void
  running: boolean
  error: string
  onStart: () => void
  onStop: () => void
  onSave: () => void
}

export default function ControlPanel({ config, onChange, running, error, onStart, onStop, onSave }: Props) {
  return (
    <div style={styles.container}>
      {error && (
        <Alert type="error" message={error} showIcon closable onClose={() => {}} style={{ marginBottom: 12 }} />
      )}

      <div style={styles.row}>
        <label style={styles.label}>根目录</label>
        <div style={{ flex: 1 }}>
          <PathPicker
            value={config.root}
            onChange={(v) => onChange({ root: v })}
            disabled={running}
            mode={config.singleFile ? 'file' : 'directory'}
            placeholder={config.singleFile ? '请选择文件' : '请选择目录'}
          />
        </div>
      </div>

      <div style={styles.row}>
        <label style={styles.label}>端口</label>
        <InputNumber
          value={config.port}
          onChange={(v) => onChange({ port: v ?? 5800 })}
          min={1024}
          max={65535}
          disabled={running}
          style={{ width: 120 }}
        />
      </div>

      <div style={styles.switchGrid}>
        <SwitchItem
          label="仅本机访问"
          checked={config.bindLocal}
          onChange={(v) => onChange({ bindLocal: v })}
          disabled={running}
        />
        <SwitchItem
          label="单文件模式"
          checked={config.singleFile}
          onChange={(v) => onChange({ singleFile: v })}
          disabled={running}
        />
        <SwitchItem
          label="启用认证"
          checked={config.authEnabled}
          onChange={(v) => onChange({ authEnabled: v })}
          disabled={running}
        />
      </div>

      {config.authEnabled && (
        <div style={{ ...styles.row, gap: 8 }}>
          <Input
            value={config.authUser}
            onChange={(e) => onChange({ authUser: e.target.value })}
            disabled={running}
            placeholder="用户名"
            style={{ flex: 1 }}
          />
          <Input.Password
            value={config.authPass}
            onChange={(e) => onChange({ authPass: e.target.value })}
            disabled={running}
            placeholder="密码"
            style={{ flex: 1 }}
          />
        </div>
      )}

      <div style={styles.actions}>
        {running ? (
          <Button danger icon={<StopOutlined />} onClick={onStop}>
            停止
          </Button>
        ) : (
          <Tooltip title={error ? error : undefined}>
            <Button type="primary" icon={<CaretRightOutlined />} onClick={onStart}>
              启动
            </Button>
          </Tooltip>
        )}
        {!running && (
          <Tooltip title="保存当前配置为默认">
            <Button icon={<SaveOutlined />} onClick={onSave}>
              保存配置
            </Button>
          </Tooltip>
        )}
      </div>

      {config.authEnabled && (
        <div style={{ color: 'var(--color-text-3)', fontSize: 11, marginTop: 4 }}>
          密码以明文保存在本地配置，请勿使用重要密码
        </div>
      )}
    </div>
  )
}

function SwitchItem({ label, checked, onChange, disabled }: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div style={styles.switchItem}>
      <Tooltip title={disabled ? '请先停止服务' : undefined}>
        <span>
          <Switch size="small" checked={checked} onChange={onChange} disabled={disabled} />
        </span>
      </Tooltip>
      <span style={{ ...styles.switchLabel, ...(disabled ? { opacity: 0.5 } : {}) }}>{label}</span>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', alignItems: 'center', gap: 8 },
  label: { color: 'var(--color-text-2)', fontSize: 13, minWidth: 60, flexShrink: 0 },
  switchGrid: { display: 'flex', flexWrap: 'wrap', gap: '8px 16px' },
  switchItem: { display: 'flex', alignItems: 'center', gap: 6 },
  switchLabel: { color: 'var(--color-text-2)', fontSize: 13 },
  actions: { display: 'flex', gap: 8, marginTop: 4 },
}
