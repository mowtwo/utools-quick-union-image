import { useMemo, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BUILTIN_LAYOUTS, slotCount } from '@/lib/layout'
import type { Layout } from '@/lib/types'
import { useStore } from '@/store'

export function useLayouts() {
  const userLayouts = useStore((s) => s.userLayouts)
  return useMemo(() => [...BUILTIN_LAYOUTS, ...userLayouts], [userLayouts])
}

export function layoutSummary(l: Layout) {
  if (l.kind === 'justify') return l.direction === 'horizontal' ? '等高' : '等宽'
  if (l.kind === 'strip') return '长图'
  return `${slotCount(l)} 张`
}

export function LayoutPicker({ value, onChange, className }: { value?: string; onChange: (id: string) => void; className?: string }) {
  const layouts = useLayouts()
  const builtin = layouts.filter((l) => l.builtin)
  const mine = layouts.filter((l) => !l.builtin)
  const item = (l: Layout) => (
    <SelectItem key={l.id} value={l.id} className="text-xs">
      {l.name}
      <span className="ml-1 text-muted-foreground">· {layoutSummary(l)}</span>
    </SelectItem>
  )
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className={className ?? 'h-7 w-full text-xs'}>
        <SelectValue placeholder="选择网格预设" />
      </SelectTrigger>
      <SelectContent>
        {mine.length > 0 && (
          <>
            <SelectGroup>
              <SelectLabel>我的预设</SelectLabel>
              {mine.map(item)}
            </SelectGroup>
            <SelectSeparator />
          </>
        )}
        <SelectGroup>
          <SelectLabel>内置预设</SelectLabel>
          {builtin.map(item)}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

/** 输入名称的小对话框 */
export function NameDialog({
  open,
  title,
  initial,
  onSubmit,
  onClose,
  children,
}: {
  open: boolean
  title: string
  initial: string
  onSubmit: (name: string) => void
  onClose: () => void
  children?: ReactNode
}) {
  const [name, setName] = useState(initial)
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setName(initial)
  }
  const submit = () => {
    if (!name.trim()) return
    onSubmit(name.trim())
    onClose()
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">{title}</DialogTitle>
        </DialogHeader>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        {children}
        <DialogFooter>
          <Button size="sm" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button size="sm" onClick={submit}>
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
