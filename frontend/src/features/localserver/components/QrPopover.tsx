import { Popover } from 'antd'
import { QRCodeSVG } from 'qrcode.react'

interface Props {
  url: string
  children: React.ReactNode
}

export default function QrPopover({ url, children }: Props) {
  const content = (
    <div style={{ padding: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <QRCodeSVG
        value={url}
        size={180}
        bgColor="#ffffff"
        fgColor="#00b96b"
        level="M"
      />
      <span style={{ fontSize: 11, color: '#666', marginTop: 8, wordBreak: 'break-all', textAlign: 'center', maxWidth: 180 }}>
        {url}
      </span>
    </div>
  )

  return (
    <Popover content={content} trigger="click" placement="left">
      {children}
    </Popover>
  )
}
