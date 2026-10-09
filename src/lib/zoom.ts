import { prefs } from './storage'

export const DEFAULT_ZOOM = 1.15
export const ZOOM_MIN = 0.8
export const ZOOM_MAX = 1.6

export function getZoom(): number {
  return prefs.get<number>('uiZoom', DEFAULT_ZOOM)
}

/** 应用界面缩放：uTools 中用 webFrame 整页缩放，浏览器预览时退回 CSS zoom */
export function applyZoom(factor: number) {
  const f = Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, factor)) * 100) / 100
  try {
    if (typeof window.services?.setZoomFactor === 'function') {
      window.services.setZoomFactor(f)
      document.documentElement.style.zoom = ''
      return f
    }
  } catch (err) {
    console.warn('webFrame 缩放失败，改用 CSS zoom', err)
  }
  document.documentElement.style.zoom = String(f)
  return f
}

export function setZoom(factor: number) {
  const f = applyZoom(factor)
  prefs.set('uiZoom', f)
  return f
}
