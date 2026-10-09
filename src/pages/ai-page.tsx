import { Bot, Check, CircleStop, Eraser, Play, Save, SendHorizontal, Undo2, Wrench } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Field, Section, SimpleSelect } from '@/components/form'
import { ImageTray } from '@/components/image-tray'
import { ImportMenu } from '@/components/import-menu'
import { LayoutPicker, useLayouts } from '@/components/layout-picker'
import { ResultDialog } from '@/components/result-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { useImport, usePaste } from '@/hooks/use-import'
import type { AiNeedUser, AiPlan } from '@/lib/ai-protocol'
import {
  executePlan,
  interrupt,
  parseEditedPlan,
  planToJson,
  respond,
  sendEditedPlan,
  sendPrompt,
  useAi,
  type TranscriptEntry,
} from '@/lib/ai-session'
import { errorMessage, isUtools, utools, envProblem } from '@/lib/bridge'
import { uid } from '@/lib/layout'
import { describeOp, STEP_LABEL } from '@/lib/workflow'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'

const EXAMPLES = ['把这些图拼成等高的一行，高度 800，导出 jpg', '每 4 张拼一个 2×2 宫格，间距 12，白底', '先统一裁成 1:1，再拼成 3 列九宫格']

export function AiPage() {
  const transcript = useAi((s) => s.transcript)
  const thinking = useAi((s) => s.thinking)
  const pending = useAi((s) => s.pending)
  const [prompt, setPrompt] = useState('')
  const [preview, setPreview] = useState<ImportedImage | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [transcript.length, thinking])

  const send = async () => {
    const text = prompt.trim()
    if (!text || thinking) return
    if (!isUtools()) {
      toast.error(envProblem() ?? '运行环境异常')
      return
    }
    setPrompt('')
    await sendPrompt(text)
  }

  return (
    <div className="flex h-full min-h-0">
      <ImageTray />
      <div className="flex min-w-0 flex-1 flex-col">
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-2 p-3">
            {!transcript.length && (
              <div className="flex flex-col items-center gap-2 py-6 text-center text-xs text-muted-foreground">
                <Bot className="size-8" />
                <p>用一句话描述要怎么处理图片栏里的图片，AI 只会使用插件内的编辑、拼接、导出能力，并以 JSON 指令执行。</p>
                <div className="flex flex-col gap-1">
                  {EXAMPLES.map((e) => (
                    <button key={e} className="rounded border px-2 py-1 hover:bg-muted" onClick={() => setPrompt(e)}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {transcript.map((e) => (
              <Entry key={e.id} entry={e} onPreview={setPreview} />
            ))}
            {thinking && <div className="animate-pulse text-xs text-muted-foreground">AI 正在编排…</div>}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
        <div className="flex items-end gap-1.5 border-t p-2">
          <textarea
            className="max-h-28 min-h-9 flex-1 resize-none rounded-md border bg-transparent px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            rows={2}
            placeholder="描述你的需求，Enter 发送，Shift+Enter 换行"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send()
              }
            }}
          />
          {thinking || pending ? (
            <Button size="icon" variant="destructive" title="中断" onClick={interrupt}>
              <CircleStop />
            </Button>
          ) : null}
          <Button size="icon" disabled={!prompt.trim() || thinking} onClick={send} title="发送">
            <SendHorizontal />
          </Button>
        </div>
      </div>
      <SidePanel />
      <ResultDialog result={preview} onClose={() => setPreview(null)} />
    </div>
  )
}

function Entry({ entry, onPreview }: { entry: TranscriptEntry; onPreview: (img: ImportedImage) => void }) {
  const [urls, setUrls] = useState<string[]>([])
  useEffect(() => {
    if (!entry.outputs?.length) return
    const list = entry.outputs.map((o) => URL.createObjectURL(new Blob([o.thumb as BlobPart], { type: 'image/webp' })))
    setUrls(list)
    return () => list.forEach((u) => URL.revokeObjectURL(u))
  }, [entry.outputs])
  const mine = entry.from === 'user'
  return (
    <div className={cn('flex flex-col gap-1', mine ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs leading-relaxed whitespace-pre-wrap',
          mine ? 'bg-primary text-primary-foreground' : entry.from === 'ai' ? 'bg-muted' : 'border bg-background text-muted-foreground',
          entry.error && 'border-destructive/50 text-destructive',
        )}
      >
        {entry.from === 'ai' && <Bot className="mr-1 inline size-3.5 align-[-2px]" />}
        {entry.text}
        {entry.json && (
          <details className="mt-1">
            <summary className="cursor-pointer text-[10px] opacity-70">JSON</summary>
            <pre className="mt-1 max-h-48 overflow-auto rounded bg-background/60 p-1.5 font-mono text-[10px] text-foreground">{entry.json}</pre>
          </details>
        )}
      </div>
      {urls.length > 0 && (
        <div className="flex max-w-[85%] flex-wrap gap-1">
          {urls.map((u, i) => (
            <button key={u} className="overflow-hidden rounded border" onClick={() => onPreview(entry.outputs![i])}>
              <img src={u} alt="" className="h-16 w-auto max-w-32 object-contain" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SidePanel() {
  const pending = useAi((s) => s.pending)
  const model = useAi((s) => s.model)
  const setModel = useAi((s) => s.setModel)
  const autoRun = useAi((s) => s.autoRun)
  const setAutoRun = useAi((s) => s.setAutoRun)
  const reset = useAi((s) => s.reset)
  const [models, setModels] = useState<UToolsAiModel[]>([])

  useEffect(() => {
    if (!isUtools()) return
    utools()
      .allAiModels()
      .then(setModels)
      .catch(() => setModels([]))
  }, [])

  return (
    <div className="flex w-56 shrink-0 flex-col border-l">
      <ScrollArea className="min-h-0 flex-1">
        {pending?.type === 'plan' && <PlanPanel key={JSON.stringify(pending)} plan={pending} />}
        {pending?.type === 'need_user' && <NeedUserPanel key={pending.message} req={pending} />}
        {!pending && (
          <Section title="待处理">
            <p className="text-[11px] text-muted-foreground">AI 返回执行计划或需要你介入时会显示在这里。</p>
          </Section>
        )}
        <Section title="设置">
          <Field label="模型">
            <SimpleSelect
              value={model || '__default'}
              onChange={(v) => setModel(v === '__default' ? '' : v)}
              options={[{ value: '__default', label: '默认模型' }, ...models.map((m) => ({ value: m.id, label: m.label }))]}
            />
          </Field>
          <Label className="flex items-center justify-between text-xs font-normal">
            计划自动执行（不确认）
            <Switch checked={autoRun} onCheckedChange={setAutoRun} />
          </Label>
          <p className="text-[10px] text-muted-foreground">执行后图片栏会替换为结果，可继续让 AI 处理。</p>
          <Button size="xs" variant="ghost" onClick={reset}>
            <Eraser /> 清空对话
          </Button>
        </Section>
      </ScrollArea>
    </div>
  )
}

function PlanPanel({ plan }: { plan: AiPlan }) {
  const layouts = useLayouts()
  const saveWorkflow = useStore((s) => s.saveWorkflow)
  const saveLayout = useStore((s) => s.saveLayout)
  const [json, setJson] = useState(() => planToJson(plan))
  const edited = json !== planToJson(plan)

  const current = (): AiPlan => (edited ? parseEditedPlan(json) : plan)
  const guard = (fn: () => unknown) => async () => {
    try {
      await fn()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Section title="执行计划" action={edited ? <Badge variant="outline">已修改</Badge> : undefined}>
      <p className="text-xs">{plan.summary}</p>
      <ol className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
        {plan.steps.map((s, i) => (
          <li key={s.id}>
            {i + 1}. {STEP_LABEL[s.type]}
            {s.type === 'edit' && `：${describeOp(s.op)}`}
            {s.type === 'stitch' &&
              `：${s.presetId === plan.layout?.id ? '内联网格' : (layouts.find((l) => l.id === s.presetId)?.name ?? s.presetId)}`}
            {s.type === 'export' && `：${s.format.toUpperCase()}`}
          </li>
        ))}
      </ol>
      <Field label="指令 JSON（可手动修改）">
        <textarea
          className="h-40 w-full resize-y rounded-md border bg-muted/40 p-1.5 font-mono text-[10px] outline-none"
          spellCheck={false}
          value={json}
          onChange={(e) => setJson(e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-1.5">
        <Button size="sm" onClick={guard(() => executePlan(current()))}>
          <Play /> 执行
        </Button>
        <Button size="sm" variant="outline" onClick={guard(() => sendEditedPlan(json))} title="把修改后的 JSON 交给 AI 检查并继续">
          <Undo2 /> 发回 AI
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="col-span-2"
          onClick={guard(() => {
            const p = current()
            if (p.layout) saveLayout({ ...p.layout, name: `${p.summary} 网格` })
            saveWorkflow({ id: uid(), name: p.summary.slice(0, 30), steps: p.steps, registerFeature: false, recursive: false })
            toast.success('已保存为工作流')
          })}
        >
          <Save /> 保存为工作流
        </Button>
      </div>
      {edited && (
        <Button size="xs" variant="ghost" onClick={() => setJson(planToJson(plan))}>
          还原 AI 的版本
        </Button>
      )}
    </Section>
  )
}

const KIND_LABEL: Record<AiNeedUser['kind'], string> = {
  select_images: '添加图片',
  choose_preset: '选择网格预设',
  manual_edit: '手动处理',
  confirm: '确认',
  text: '补充信息',
}

function NeedUserPanel({ req }: { req: AiNeedUser }) {
  const importInto = useImport()
  const paste = usePaste()
  const images = useStore((s) => s.images)
  const setTab = useStore((s) => s.setTab)
  const [answer, setAnswer] = useState('')
  const [presetId, setPresetId] = useState<string>()
  const layouts = useLayouts()

  return (
    <Section title={`需要你介入 · ${KIND_LABEL[req.kind]}`}>
      <p className="rounded-md bg-amber-500/10 p-2 text-xs leading-relaxed">{req.message}</p>
      {req.kind === 'select_images' && (
        <>
          <ImportMenu onClipboard={paste} onPaths={(p) => importInto(p)} label="添加图片" variant="outline" />
          <Button size="sm" disabled={!images.length} onClick={() => respond({ note: `已添加，共 ${images.length} 张` })}>
            <Check /> 已添加（{images.length} 张），继续
          </Button>
        </>
      )}
      {req.kind === 'choose_preset' && (
        <>
          <LayoutPicker value={presetId} onChange={setPresetId} />
          <Button
            size="sm"
            disabled={!presetId}
            onClick={() => respond({ presetId, answer: layouts.find((l) => l.id === presetId)?.name })}
          >
            <Check /> 确定
          </Button>
        </>
      )}
      {req.kind === 'manual_edit' && (
        <>
          <p className="text-[11px] text-muted-foreground">可以在「编辑」页或其他软件里处理图片，处理完把结果放回图片栏后继续。</p>
          <Button size="sm" variant="outline" onClick={() => setTab('edit')}>
            <Wrench /> 去编辑页处理
          </Button>
          <Input className="h-7 text-xs" placeholder="可选：说明你做了什么" value={answer} onChange={(e) => setAnswer(e.target.value)} />
          <Button size="sm" onClick={() => respond({ done: true, note: answer || '已手动处理' })}>
            <Check /> 已处理，继续
          </Button>
        </>
      )}
      {req.kind === 'confirm' && (
        <div className="flex flex-wrap gap-1.5">
          {(req.options?.length ? req.options : ['是', '否']).map((o) => (
            <Button key={o} size="sm" variant="outline" onClick={() => respond({ answer: o })}>
              {o}
            </Button>
          ))}
        </div>
      )}
      {req.kind === 'text' && (
        <>
          <Input
            className="h-7 text-xs"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && answer.trim() && respond({ answer })}
          />
          <Button size="sm" disabled={!answer.trim()} onClick={() => respond({ answer })}>
            <Check /> 提交
          </Button>
        </>
      )}
      <Button size="xs" variant="ghost" className="text-destructive" onClick={interrupt}>
        <CircleStop /> 中断
      </Button>
    </Section>
  )
}
