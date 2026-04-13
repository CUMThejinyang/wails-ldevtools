import { Button, InputNumber } from 'antd'
import { MinusOutlined, PlusOutlined } from '@ant-design/icons'

interface Props {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  suffix?: string
}

export default function NumberStepper({
  value, onChange, min = 1, max = 99, step = 1, disabled, suffix,
}: Props) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v))
  const dec = () => onChange(clamp(value - step))
  const inc = () => onChange(clamp(value + step))

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <Button
        size="small"
        icon={<MinusOutlined />}
        onClick={dec}
        disabled={disabled || value <= min}
      />
      <InputNumber
        value={value}
        onChange={(v) => onChange(clamp(Number(v ?? min)))}
        min={min}
        max={max}
        step={step}
        controls={false}
        disabled={disabled}
        style={{ width: 64, textAlign: 'center' }}
      />
      <Button
        size="small"
        icon={<PlusOutlined />}
        onClick={inc}
        disabled={disabled || value >= max}
      />
      {suffix && <span style={{ color: 'var(--color-text-3)', fontSize: 12, marginLeft: 4 }}>{suffix}</span>}
    </div>
  )
}
