import { Bot, Info, Keyboard, LayoutGrid, Loader2, Minus, PencilRuler, Plus, Redo2, Shapes, Undo2, Workflow } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Toaster } from '@/components/ui/sonner'
import { usePaste } from '@/hooks/use-import'
import { redo, undo, useHistory } from '@/lib/history'
import { installShortcuts, modKey, SHORTCUT_HELP } from '@/lib/shortcuts'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { envProblem, isUtools } from '@/lib/bridge'
import { getZoom, setZoom, ZOOM_MAX, ZOOM_MIN } from '@/lib/zoom'
// 页面按需加载：打开插件时只加载当前页，其余页面切换时再加载
const StitchPage = lazy(() => import('@/pages/stitch-page').then((m) => ({ default: m.StitchPage })))
const EditorPage = lazy(() => import('@/pages/editor-page').then((m) => ({ default: m.EditorPage })))
const PresetsPage = lazy(() => import('@/pages/presets-page').then((m) => ({ default: m.PresetsPage })))
const WorkflowPage = lazy(() => import('@/pages/workflow-page').then((m) => ({ default: m.WorkflowPage })))
const AiPage = lazy(() => import('@/pages/ai-page').then((m) => ({ default: m.AiPage })))

const REPO_URL = 'https://github.com/mowtwo/utools-quick-union-image'
import { useStore, type Tab } from '@/store'

const TABS: Array<{ value: Tab; label: string; icon: typeof LayoutGrid }> = [
  { value: 'stitch', label: '拼接', icon: LayoutGrid },
  { value: 'edit', label: '编辑', icon: PencilRuler },
  { value: 'presets', label: '网格预设', icon: Shapes },
  { value: 'workflow', label: '工作流', icon: Workflow },
  { value: 'ai', label: 'AI 编排', icon: Bot },
]

export default function App() {
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  const busy = useStore((s) => s.busy)
  const paste = usePaste()
  const { canUndo, canRedo } = useHistory()

  useEffect(
    () =>
      installShortcuts({
        undo: () => {
          if (useStore.getState().busy) return
          undo()
        },
        redo: () => {
          if (useStore.getState().busy) return
          redo()
        },
        paste: () => {
          if (useStore.getState().busy) return
          paste()
        },
      }),
    [paste],
  )

  return (
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <header className="flex h-10 shrink-0 items-center gap-2 border-b px-2">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList className="h-8">
              {TABS.map(({ value, label, icon: Icon }) => (
                <TabsTrigger key={value} value={value} className="gap-1 px-2.5 text-xs">
                  <Icon className="size-3.5" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {!isUtools() && (
            <span className="min-w-0 truncate text-[11px] text-amber-600" title={envProblem() ?? ''}>
              ⚠ {envProblem()}
            </span>
          )}
          <div className="ml-auto flex items-center gap-0.5">
            <button className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30" disabled={!canUndo} title={`撤销（${modKey}Z）`} onClick={undo}>
              <Undo2 className="size-3.5" />
            </button>
            <button className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30" disabled={!canRedo} title="重做" onClick={redo}>
              <Redo2 className="size-3.5" />
            </button>
            <ShortcutHelp />
            <About />
          </div>
          <ZoomControl />
        </header>
        <main className="min-h-0 flex-1">
          <Suspense fallback={<div className="flex h-full items-center justify-center text-muted-foreground"><Loader2 className="size-4 animate-spin" /></div>}>
            {tab === 'stitch' && <StitchPage />}
            {tab === 'edit' && <EditorPage />}
            {tab === 'presets' && <PresetsPage />}
            {tab === 'workflow' && <WorkflowPage />}
            {tab === 'ai' && <AiPage />}
          </Suspense>
        </main>
        {busy && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-lg border bg-popover px-4 py-2.5 text-sm shadow-lg">
              <Loader2 className="size-4 animate-spin" />
              {busy}
            </div>
          </div>
        )}
        <Toaster position="bottom-center" richColors closeButton />
      </div>
  )
}

function ZoomControl() {
  const [zoom, setZoomState] = useState(getZoom)
  const change = (d: number) => setZoomState(setZoom(zoom + d))
  return (
    <div className="flex items-center gap-0.5 border-l pl-1 text-xs text-muted-foreground" title="界面缩放（双击恢复默认）">
      <button className="rounded p-1 hover:bg-muted disabled:opacity-40" disabled={zoom <= ZOOM_MIN} onClick={() => change(-0.05)}>
        <Minus className="size-3.5" />
      </button>
      <span className="w-9 cursor-default text-center tabular-nums" onDoubleClick={() => setZoomState(setZoom(1.15))}>
        {Math.round(zoom * 100)}%
      </span>
      <button className="rounded p-1 hover:bg-muted disabled:opacity-40" disabled={zoom >= ZOOM_MAX} onClick={() => change(0.05)}>
        <Plus className="size-3.5" />
      </button>
    </div>
  )
}

function ShortcutHelp() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="rounded p-1 text-muted-foreground hover:bg-muted" title="快捷键" onClick={() => setOpen(true)}>
        <Keyboard className="size-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>快捷键</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
            {SHORTCUT_HELP.map(([key, desc]) => (
              <div key={key} className="contents">
                <kbd className="h-fit w-fit justify-self-end rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap">{key}</kbd>
                <span className="self-center text-muted-foreground">{desc}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** 打开外部链接：uTools 里用系统浏览器，浏览器调试时新开标签页 */
function openLink(url: string) {
  if (window.utools) void window.utools.shellOpenExternal(url)
  else window.open(url, '_blank', 'noopener')
}

function About() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="rounded p-1 text-muted-foreground hover:bg-muted" title="关于与版权" onClick={() => setOpen(true)}>
        <Info className="size-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>关于快拼图</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-xs">
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">版本</span>
              <span className="font-mono">v{__APP_VERSION__}</span>
            </div>
            <div className="space-y-1">
              <div className="text-muted-foreground">原始仓库（开源，MIT 许可证）</div>
              <button className="break-all text-left text-primary underline-offset-2 hover:underline" onClick={() => openLink(REPO_URL)}>
                {REPO_URL}
              </button>
            </div>
            <p className="text-muted-foreground">Copyright © 2026 mowtwo。欢迎在仓库里反馈问题或提交改进。</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
