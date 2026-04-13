import { theme as antdTheme, type ThemeConfig } from 'antd'
import type { ThemeMode } from '@/types'

const BASE_PRIMARY = '#00b96b'

export function buildAntdTheme(mode: ThemeMode): ThemeConfig {
  const isDark = mode === 'dark'
  return {
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: BASE_PRIMARY,
      colorSuccess: BASE_PRIMARY,
      colorError:   '#ff4d50',
      colorWarning: '#faad14',
      colorInfo:    BASE_PRIMARY,

      colorBgBase:      isDark ? '#181818' : '#efefef',
      colorBgContainer: isDark ? '#222222' : '#ffffff',
      colorBgElevated:  isDark ? '#2a2a2a' : '#ffffff',
      colorBgLayout:    isDark ? '#181818' : '#efefef',

      colorBorder:          isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.14)',
      colorBorderSecondary: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.09)',

      colorText:            isDark ? 'rgba(255,255,245,0.9)' : 'rgba(0,0,0,0.88)',
      colorTextSecondary:   isDark ? 'rgba(235,235,245,0.6)' : 'rgba(0,0,0,0.65)',
      colorTextTertiary:    isDark ? 'rgba(235,235,245,0.35)' : 'rgba(0,0,0,0.46)',
      colorTextQuaternary:  isDark ? 'rgba(235,235,245,0.25)' : 'rgba(0,0,0,0.35)',

      borderRadius:    7,
      borderRadiusLG:  10,
      borderRadiusSM:  5,
      controlHeight:   32,
      controlHeightSM: 28,
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", system-ui, Roboto, sans-serif',
      fontSize: 14,
    },
    components: {
      Button:     { controlHeight: 30, borderRadius: 7, paddingInline: 14, fontWeight: 500 },
      Input:      { controlHeight: 30, borderRadius: 7 },
      InputNumber:{ controlHeight: 30, borderRadius: 7 },
      Select:     { controlHeight: 30, borderRadius: 7 },
      Modal:      { borderRadiusLG: 10 },
      Table:      { headerBg: isDark ? '#1d1d1d' : '#fafafa', rowHoverBg: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' },
      Tabs:       { itemActiveColor: BASE_PRIMARY, itemSelectedColor: BASE_PRIMARY, inkBarColor: BASE_PRIMARY },
      Tag:        { borderRadiusSM: 4 },
      Progress:   { defaultColor: BASE_PRIMARY },
      Switch:     { colorPrimary: BASE_PRIMARY },
    },
  }
}

export function applyThemeAttribute(mode: ThemeMode) {
  document.body.setAttribute('theme-mode', mode)
}
