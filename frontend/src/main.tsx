import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider, App as AntdApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'

import App from './App'
import { AppAliveScope } from '@/app/keepalive'
import { buildAntdTheme } from '@/app/theme'
import './styles/index.css'

dayjs.locale('zh-cn')

const initialMode = (document.body.getAttribute('theme-mode') as 'dark' | 'light') ?? 'dark'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider theme={buildAntdTheme(initialMode)} locale={zhCN}>
      <AntdApp>
        <AppAliveScope>
          <App />
        </AppAliveScope>
      </AntdApp>
    </ConfigProvider>
  </StrictMode>,
)
