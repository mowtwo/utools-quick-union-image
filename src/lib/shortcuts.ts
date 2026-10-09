import { useEffect, useRef } from 'react'

// 快捷键：macOS 用 ⌘，Windows / Linux 用 Ctrl。
// 页面通过 usePageShortcuts 注册，优先于全局处理；处理函数返回 false 表示“不处理”，继续交给下一层。

export const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)
export const modKey = isMac ? '⌘' : 'Ctrl+'

export type Action =
  | 'undo'
  | 'redo'
  | 'paste'
  | 'selectAll'
  | 'delete'
  | 'escape'
  | 'submit'
  | 'save'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomFit'
  | 'zoomActual'

export type Handlers = Partial<Record<Action, () => void | boolean>>

export const SHORTCUT_HELP: Array<[string, string]> = [
  [`${modKey}Z`, '撤销'],
  [isMac ? '⇧⌘Z' : 'Ctrl+Y / Ctrl+Shift+Z', '重做'],
  [`${modKey}V`, '粘贴剪贴板中的图片或文件到图片栏'],
  [`${modKey}A`, '全选格子 / 图层'],
  ['Delete / Backspace', '移除选中的图片（预设页为删除格子）'],
  ['Esc', '取消选择'],
  [`${modKey}Enter`, '生成拼图 / 应用编辑 / 运行工作流'],
  [`${modKey}S`, '保存预设'],
  [`${modKey}= / ${modKey}-`, '画布放大 / 缩小'],
  [`${modKey}0 / ${modKey}1`, '画布适应窗口 / 实际像素'],
  ['双指捏合 / ⌘、Ctrl+滚轮', '画布缩放'],
  ['双指滑动 / 空格+拖动', '画布平移'],
]

export function isEditableTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null
  if (!el || !el.tagName) return false
  if (el.isContentEditable) return true
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  if (el.tagName === 'INPUT') {
    const type = (el as HTMLInputElement).type
    return !['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file'].includes(type)
  }
  return false
}

function actionOf(e: KeyboardEvent): Action | null {
  const mod = isMac ? e.metaKey : e.ctrlKey
  const key = e.key.toLowerCase()
  if (mod && !e.altKey) {
    if (key === 'z') return e.shiftKey ? 'redo' : 'undo'
    if (key === 'y' && !isMac) return 'redo'
    if (key === 'v' && !e.shiftKey) return 'paste'
    if (key === 'a') return 'selectAll'
    if (key === 'enter') return 'submit'
    if (key === 's') return 'save'
    if (key === '=' || key === '+') return 'zoomIn'
    if (key === '-' || key === '_') return 'zoomOut'
    if (key === '0') return 'zoomFit'
    if (key === '1') return 'zoomActual'
    return null
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return null
  if (key === 'delete' || key === 'backspace') return 'delete'
  if (key === 'escape') return 'escape'
  return null
}

/** 文本框里这些按键交给浏览器原生处理 */
const NATIVE_IN_INPUT: Action[] = ['undo', 'redo', 'paste', 'selectAll', 'delete', 'escape', 'zoomIn', 'zoomOut']

const layers: Array<{ current: Handlers }> = []

export function usePageShortcuts(handlers: Handlers) {
  const ref = useRef(handlers)
  ref.current = handlers
  useEffect(() => {
    layers.push(ref)
    return () => {
      const i = layers.indexOf(ref)
      if (i >= 0) layers.splice(i, 1)
    }
  }, [])
}

export function installShortcuts(global: Handlers) {
  const onKey = (e: KeyboardEvent) => {
    if (e.isComposing) return
    const action = actionOf(e)
    if (!action) return
    if (isEditableTarget(e.target) && NATIVE_IN_INPUT.includes(action)) return
    // 弹窗打开时只保留弹窗自己的键盘行为
    if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return
    const chain = [...layers.map((l) => l.current).reverse(), global]
    for (const h of chain) {
      const fn = h[action]
      if (fn && fn() !== false) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
    }
    // 粘贴始终拦截，避免 uTools 把剪贴板文件当成新的指令输入
    if (action === 'paste') {
      e.preventDefault()
      e.stopPropagation()
    }
  }
  const onPaste = (e: ClipboardEvent) => {
    if (!isEditableTarget(e.target)) {
      e.preventDefault()
      e.stopPropagation()
    }
  }
  window.addEventListener('keydown', onKey, true)
  document.addEventListener('paste', onPaste, true)
  return () => {
    window.removeEventListener('keydown', onKey, true)
    document.removeEventListener('paste', onPaste, true)
  }
}
