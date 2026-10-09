import { create } from 'zustand'
import { BUILTIN_LAYOUTS } from './lib/layout'
import { layoutStore, registeredLayoutIds, syncLayoutFeatures, syncWorkflowFeatures, workflowStore } from './lib/storage'
import type { ImageItem, Layout, Workflow } from './lib/types'

export type Tab = 'edit' | 'stitch' | 'presets' | 'workflow' | 'ai'

export interface PendingRun {
  workflowId: string
  paths: string[]
  dataUrl?: string
  autoRun: boolean
}

interface State {
  tab: Tab
  setTab: (tab: Tab) => void

  busy: string | null
  setBusy: (msg: string | null) => void

  /** 图片栏：编辑、拼接共用，顺序即拼接序号 */
  images: ImageItem[]
  activeId: string | null
  setActive: (id: string | null) => void
  addImages: (items: ImageItem[], replace?: boolean) => void
  removeImage: (id: string) => void
  removeImages: (ids: string[]) => void
  clearImages: () => void
  replaceImage: (id: string, item: ImageItem) => void
  moveImage: (from: number, to: number) => void
  swapImages: (a: number, b: number) => void

  /** 用户预设 + 内置预设 */
  userLayouts: Layout[]
  layouts: () => Layout[]
  saveLayout: (layout: Layout) => void
  deleteLayout: (id: string) => void

  /** 拼接页正在使用的布局（草稿副本） */
  stitchLayout: Layout
  setStitchLayout: (layout: Layout) => void

  /** 预设页正在编辑的布局 */
  editingLayout: Layout | null
  setEditingLayout: (layout: Layout | null) => void

  workflows: Workflow[]
  saveWorkflow: (wf: Workflow) => void
  deleteWorkflow: (id: string) => void
  activeWorkflowId: string | null
  setActiveWorkflow: (id: string | null) => void
  workflowInputs: string[]
  setWorkflowInputs: (paths: string[]) => void
  /** 从动态指令进入时，图片导入后自动生成拼图 */
  autoStitch: boolean
  setAutoStitch: (v: boolean) => void
  registeredLayouts: string[]
  toggleLayoutFeature: (id: string, on: boolean) => void
  pendingRun: PendingRun | null
  setPendingRun: (run: PendingRun | null) => void
}

const initialUserLayouts = (() => {
  try {
    return layoutStore.list()
  } catch {
    return []
  }
})()

const initialWorkflows = (() => {
  try {
    return workflowStore.list()
  } catch {
    return []
  }
})()

export const useStore = create<State>((set, get) => ({
  tab: 'stitch',
  setTab: (tab) => set({ tab }),

  busy: null,
  setBusy: (busy) => set({ busy }),

  images: [],
  activeId: null,
  setActive: (activeId) => set({ activeId }),
  addImages: (items, replace) =>
    set((s) => {
      const images = replace ? items : [...s.images, ...items]
      return { images, activeId: replace || !s.activeId ? (items[0]?.id ?? null) : s.activeId }
    }),
  // 被移除 / 替换的预览不在这里释放：撤销还会用到，由 lib/history 统一回收
  removeImage: (id) => get().removeImages([id]),
  removeImages: (ids) =>
    set((s) => {
      const images = s.images.filter((i) => !ids.includes(i.id))
      return { images, activeId: s.activeId && ids.includes(s.activeId) ? (images[0]?.id ?? null) : s.activeId }
    }),
  clearImages: () => set({ images: [], activeId: null }),
  replaceImage: (id, item) =>
    set((s) => {
      return {
        images: s.images.map((i) => (i.id === id ? item : i)),
        activeId: s.activeId === id ? item.id : s.activeId,
      }
    }),
  moveImage: (from, to) =>
    set((s) => {
      const images = [...s.images]
      const [it] = images.splice(from, 1)
      images.splice(Math.max(0, Math.min(images.length, to)), 0, it)
      return { images }
    }),
  swapImages: (a, b) =>
    set((s) => {
      if (a === b || a < 0 || b < 0 || a >= s.images.length || b >= s.images.length) return {}
      const images = [...s.images]
      ;[images[a], images[b]] = [images[b], images[a]]
      return { images }
    }),

  userLayouts: initialUserLayouts,
  layouts: () => [...BUILTIN_LAYOUTS, ...get().userLayouts],
  saveLayout: (layout) => {
    layoutStore.save(layout)
    set((s) => {
      const exists = s.userLayouts.some((l) => l.id === layout.id)
      const saved = { ...layout, builtin: false }
      const userLayouts = exists ? s.userLayouts.map((l) => (l.id === layout.id ? saved : l)) : [...s.userLayouts, saved]
      if (s.registeredLayouts.includes(layout.id)) syncLayoutFeatures(s.registeredLayouts, [...BUILTIN_LAYOUTS, ...userLayouts])
      return { userLayouts }
    })
  },
  deleteLayout: (id) => {
    layoutStore.remove(id)
    set((s) => {
      const userLayouts = s.userLayouts.filter((l) => l.id !== id)
      const registeredLayouts = s.registeredLayouts.filter((x) => x !== id)
      syncLayoutFeatures(registeredLayouts, [...BUILTIN_LAYOUTS, ...userLayouts])
      return { userLayouts, registeredLayouts }
    })
  },

  stitchLayout: JSON.parse(JSON.stringify(BUILTIN_LAYOUTS.find((l) => l.id === 'builtin-justify-h')!)) as Layout,
  setStitchLayout: (stitchLayout) => set({ stitchLayout }),

  editingLayout: null,
  setEditingLayout: (editingLayout) => set({ editingLayout }),

  workflows: initialWorkflows,
  saveWorkflow: (wf) => {
    workflowStore.save(wf)
    set((s) => {
      const exists = s.workflows.some((w) => w.id === wf.id)
      const workflows = exists ? s.workflows.map((w) => (w.id === wf.id ? wf : w)) : [...s.workflows, wf]
      syncWorkflowFeatures(workflows)
      return { workflows }
    })
  },
  deleteWorkflow: (id) => {
    workflowStore.remove(id)
    set((s) => {
      const workflows = s.workflows.filter((w) => w.id !== id)
      syncWorkflowFeatures(workflows)
      return { workflows, activeWorkflowId: s.activeWorkflowId === id ? null : s.activeWorkflowId }
    })
  },
  activeWorkflowId: initialWorkflows[0]?.id ?? null,
  setActiveWorkflow: (activeWorkflowId) => set({ activeWorkflowId }),
  workflowInputs: [],
  setWorkflowInputs: (workflowInputs) => set({ workflowInputs }),
  autoStitch: false,
  setAutoStitch: (autoStitch) => set({ autoStitch }),
  registeredLayouts: registeredLayoutIds(),
  toggleLayoutFeature: (id, on) => {
    const ids = on ? [...new Set([...get().registeredLayouts, id])] : get().registeredLayouts.filter((x) => x !== id)
    syncLayoutFeatures(ids, get().layouts())
    set({ registeredLayouts: ids })
  },
  pendingRun: null,
  setPendingRun: (pendingRun) => set({ pendingRun }),
}))
