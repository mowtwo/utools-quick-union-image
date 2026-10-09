import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { handlePluginEnter } from './lib/enter'
import { syncLayoutFeatures, syncWorkflowFeatures } from './lib/storage'
import { useStore } from './store'
import { applyZoom, getZoom } from './lib/zoom'

function applyTheme() {
  const dark = window.utools ? window.utools.isDarkColors() : window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.classList.toggle('dark', dark)
}

// 让插件页面持有键盘焦点：否则 ⌘V 等按键会进入 uTools 的输入框，
// 剪贴板里的文件会被当作新的指令输入
function focusPage() {
  setTimeout(() => {
    try {
      window.utools?.subInputBlur()
    } catch {
      /* 自定义窗口中不可用 */
    }
    window.focus()
  }, 50)
}

applyTheme()
applyZoom(getZoom())

if (window.utools) {
  window.utools.onPluginEnter((action) => {
    applyTheme()
    applyZoom(getZoom())
    handlePluginEnter(action)
    focusPage()
  })
  focusPage()
  // 启动时让动态指令与已保存的工作流保持一致
  syncWorkflowFeatures(useStore.getState().workflows)
  syncLayoutFeatures(useStore.getState().registeredLayouts, useStore.getState().layouts())
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
