import { toast } from 'sonner'
import { useStore } from '@/store'
import { errorMessage, importDataUrl, importPaths, pathsFromPayload, PERMISSION_HINT, services, toImageItem, TRAY_THUMB } from './bridge'
import { BUILTIN_LAYOUTS } from './layout'
import { LAYOUT_FEATURE_PREFIX, WORKFLOW_FEATURE_PREFIX } from './storage'

/** 处理 uTools 进入事件：按功能编码切换页面并导入输入 */
export async function handlePluginEnter(action: UToolsPluginEnterAction) {
  const store = useStore.getState()
  const { paths, dataUrl } = pathsFromPayload(action)

  if (action.code.startsWith(WORKFLOW_FEATURE_PREFIX)) {
    const id = action.code.slice(WORKFLOW_FEATURE_PREFIX.length)
    if (!store.workflows.some((w) => w.id === id)) {
      toast.error('该工作流已被删除')
      return
    }
    store.setTab('workflow')
    store.setActiveWorkflow(id)
    store.setWorkflowInputs(paths)
    store.setPendingRun({ workflowId: id, paths, dataUrl, autoRun: paths.length > 0 || !!dataUrl })
    return
  }

  let autoStitch = false
  if (action.code.startsWith(LAYOUT_FEATURE_PREFIX)) {
    const id = action.code.slice(LAYOUT_FEATURE_PREFIX.length)
    const layout = [...BUILTIN_LAYOUTS, ...store.userLayouts].find((l) => l.id === id)
    if (!layout) {
      toast.error('该网格预设已被删除')
      return
    }
    store.setStitchLayout(JSON.parse(JSON.stringify(layout)))
    store.setTab('stitch')
    autoStitch = paths.length > 0 || !!dataUrl
  }

  const code = action.code.startsWith(LAYOUT_FEATURE_PREFIX) ? 'stitch' : action.code
  switch (code) {
    case 'workflow':
      store.setTab('workflow')
      if (paths.length) store.setWorkflowInputs(paths)
      return
    case 'presets':
      store.setTab('presets')
      return
    case 'edit':
    case 'stitch':
    case 'ai':
      store.setTab(code)
      break
    default:
      return
  }

  if (!paths.length && !dataUrl) return
  store.setBusy('导入图片…')
  try {
    const items = []
    if (dataUrl) items.push(toImageItem(await importDataUrl(dataUrl)))
    if (paths.length) {
      const res = await importPaths(paths, { onProgress: (d, t) => useStore.getState().setBusy(`导入图片 ${d}/${t}`) })
      items.push(...res.images.map(toImageItem))
      let failed = res.failed
      // 沙盒应用（如微信）里的文件读不到时，用剪贴板位图兜底
      if (failed.some((f) => /EPERM|EACCES/i.test(f.reason))) {
        const bytes = services().readClipboardImage()
        if (bytes) {
          items.push(toImageItem(await services().importBytes(bytes, '粘贴的图片', TRAY_THUMB)))
          failed = failed.slice(1)
        }
      }
      if (failed.length) {
        toast.error(`${failed.length} 个文件导入失败，已跳过`, {
          description:
            failed.slice(0, 3).map((f) => `${f.path.split(/[\\/]/).pop()}：${f.reason}`).join('\n') +
            (failed.some((f) => /EPERM|EACCES/i.test(f.reason)) ? `\n${PERMISSION_HINT}` : ''),
        })
      }
    }
    // 从 uTools 带入的文件替换当前图片栏
    if (items.length) {
      useStore.getState().addImages(items, true)
      if (autoStitch) useStore.getState().setAutoStitch(true)
    }
  } catch (err) {
    toast.error('导入失败', { description: errorMessage(err) })
  } finally {
    useStore.getState().setBusy(null)
  }
}
