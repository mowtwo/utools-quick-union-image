import { create } from 'zustand'
import { useStore } from '@/store'
import { releaseImage } from './bridge'
import type { ImageItem, Layout } from './types'

// 撤销 / 重做：记录图片栏、拼接布局、预设草稿三类“文档状态”。
// 连续的细碎修改（拖动格子、拖滑块）在 MERGE_MS 内合并为一步。

const LIMIT = 80
const MERGE_MS = 500

interface Snap {
  images: ImageItem[]
  activeId: string | null
  stitchLayout: Layout
  editingLayout: Layout | null
}

export const useHistory = create(() => ({ canUndo: false, canRedo: false }))

let past: Snap[] = []
let future: Snap[] = []
let merging = false
let mergeTimer: ReturnType<typeof setTimeout> | undefined
let applying = false
/** 出现过的所有图片预览，不再被任何状态引用时才释放 blob URL */
const known = new Map<string, ImageItem>()

const snap = (s: Snap): Snap => ({
  images: s.images,
  activeId: s.activeId,
  stitchLayout: s.stitchLayout,
  editingLayout: s.editingLayout,
})

function notify() {
  useHistory.setState({ canUndo: past.length > 0, canRedo: future.length > 0 })
}

function collect() {
  const live = new Set<string>()
  for (const s of [useStore.getState(), ...past, ...future]) for (const img of s.images) live.add(img.id)
  for (const [id, img] of known) {
    if (!live.has(id)) {
      releaseImage(img)
      known.delete(id)
    }
  }
}

useStore.subscribe((s, prev) => {
  for (const img of s.images) known.set(img.id, img)
  if (applying) return
  const changed = s.images !== prev.images || s.stitchLayout !== prev.stitchLayout
  // 预设页首次载入草稿（null → 布局）不算一次修改
  const draftChanged = s.editingLayout !== prev.editingLayout && prev.editingLayout !== null
  if (!changed && !draftChanged) return
  if (!merging) {
    past.push(snap(prev))
    if (past.length > LIMIT) past = past.slice(-LIMIT)
    future = []
    merging = true
    notify()
    collect()
  }
  clearTimeout(mergeTimer)
  mergeTimer = setTimeout(() => {
    merging = false
  }, MERGE_MS)
})

function restore(target: Snap) {
  applying = true
  const activeId = target.images.some((i) => i.id === target.activeId) ? target.activeId : (target.images[0]?.id ?? null)
  useStore.setState({ ...target, activeId })
  applying = false
}

export function undo() {
  const prev = past.pop()
  if (!prev) return false
  clearTimeout(mergeTimer)
  merging = false
  future.push(snap(useStore.getState()))
  restore(prev)
  notify()
  return true
}

export function redo() {
  const next = future.pop()
  if (!next) return false
  clearTimeout(mergeTimer)
  merging = false
  past.push(snap(useStore.getState()))
  restore(next)
  notify()
  return true
}
