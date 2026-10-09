import type { Layout, Workflow } from './types'
import { IMAGE_FILTER } from './bridge'

// 网格预设、工作流属于用户数据 → utools.db（同步数据库）；
// 不在 uTools 里（浏览器调试）时退回 localStorage。

const LAYOUT_PREFIX = 'layout/'
const WORKFLOW_PREFIX = 'workflow/'

function db() {
  return window.utools?.db
}

function putDoc(id: string, data: unknown) {
  const d = db()
  if (!d) {
    localStorage.setItem(id, JSON.stringify(data))
    return
  }
  const old = d.get(id)
  const res = d.put({ _id: id, _rev: old?._rev, data })
  if (res.error) throw new Error(res.message || '保存失败')
}

function removeDoc(id: string) {
  const d = db()
  if (!d) {
    localStorage.removeItem(id)
    return
  }
  d.remove(id)
}

function listDocs<T>(prefix: string): T[] {
  const d = db()
  if (!d) {
    const out: T[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(prefix)) {
        try {
          out.push(JSON.parse(localStorage.getItem(k)!))
        } catch {
          /* 忽略损坏数据 */
        }
      }
    }
    return out
  }
  return d.allDocs(prefix).map((doc) => doc.data as T).filter(Boolean)
}

const byTime = (a: { updatedAt?: number }, b: { updatedAt?: number }) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0)

export const layoutStore = {
  list: () => listDocs<Layout>(LAYOUT_PREFIX).sort(byTime),
  save: (layout: Layout) => putDoc(LAYOUT_PREFIX + layout.id, { ...layout, builtin: false, updatedAt: Date.now() }),
  remove: (id: string) => removeDoc(LAYOUT_PREFIX + id),
}

export const workflowStore = {
  list: () => listDocs<Workflow>(WORKFLOW_PREFIX).sort(byTime),
  save: (wf: Workflow) => putDoc(WORKFLOW_PREFIX + wf.id, { ...wf, updatedAt: Date.now() }),
  remove: (id: string) => removeDoc(WORKFLOW_PREFIX + id),
}

// 简单偏好设置 → dbStorage
export const prefs = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = window.utools ? window.utools.dbStorage.getItem(key) : JSON.parse(localStorage.getItem(`pref:${key}`) ?? 'null')
      return (v ?? fallback) as T
    } catch {
      return fallback
    }
  },
  set(key: string, value: unknown) {
    if (window.utools) window.utools.dbStorage.setItem(key, value)
    else localStorage.setItem(`pref:${key}`, JSON.stringify(value))
  },
}

// ---------- 工作流注册为 uTools 动态指令 ----------

export const WORKFLOW_FEATURE_PREFIX = 'wf-'

/** 指令名称不能包含 \ / : * ? " < > | 及控制字符 */
function cmdName(name: string) {
  return name.replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').trim().slice(0, 40) || '未命名'
}

export function syncWorkflowFeatures(workflows: Workflow[]) {
  const u = window.utools
  if (!u) return
  const wanted = new Map(workflows.filter((w) => w.registerFeature).map((w) => [WORKFLOW_FEATURE_PREFIX + w.id, w]))
  for (const f of u.getFeatures()) {
    if (f.code.startsWith(WORKFLOW_FEATURE_PREFIX) && !wanted.has(f.code)) u.removeFeature(f.code)
  }
  for (const [code, wf] of wanted) {
    const label = `工作流 ${cmdName(wf.name)}`
    u.setFeature({
      code,
      description: `运行图片工作流「${wf.name}」`,
      cmds: [
        label,
        { type: 'files', label, minLength: 1, maxLength: 500 },
        { type: 'img', label },
      ],
    })
  }
}

// ---------- 网格预设注册为 uTools 动态指令 ----------

export const LAYOUT_FEATURE_PREFIX = 'grid-'

export function registeredLayoutIds(): string[] {
  return prefs.get<string[]>('registeredLayouts', [])
}

export function syncLayoutFeatures(ids: string[], layouts: Layout[]) {
  prefs.set('registeredLayouts', ids)
  const u = window.utools
  if (!u) return
  const wanted = new Map(
    ids
      .map((id) => layouts.find((l) => l.id === id))
      .filter((l): l is Layout => !!l)
      .map((l) => [LAYOUT_FEATURE_PREFIX + l.id, l]),
  )
  for (const f of u.getFeatures()) {
    if (f.code.startsWith(LAYOUT_FEATURE_PREFIX) && !wanted.has(f.code)) u.removeFeature(f.code)
  }
  for (const [code, layout] of wanted) {
    const label = `拼图 ${cmdName(layout.name)}`
    u.setFeature({
      code,
      description: `用网格预设「${layout.name}」拼接选中的图片`,
      cmds: [
        label,
        { type: 'files', label, fileType: 'file', extensions: IMAGE_FILTER.extensions, minLength: 1, maxLength: 500 },
        { type: 'files', label: `${label}（文件夹）`, fileType: 'directory', minLength: 1, maxLength: 20 },
      ],
    })
  }
}
