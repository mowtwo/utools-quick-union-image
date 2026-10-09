import { useEffect, useState, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export function Field({ label, children, className, hint }: { label: string; children: ReactNode; className?: string; hint?: string }) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[10px] leading-tight text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b px-3 py-2.5">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold">{title}</h4>
        {action}
      </div>
      {children}
    </div>
  )
}

/** 数字输入：失焦或回车时提交，空值视为 placeholder 对应的含义 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
  suffix,
  className,
  allowEmpty,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  placeholder?: string
  suffix?: string
  className?: string
  /** 允许留空（提交为 0） */
  allowEmpty?: boolean
}) {
  const show = (v: number) => (allowEmpty && v === 0 ? '' : String(v))
  const [text, setText] = useState(show(value))
  useEffect(() => {
    setText(show(value))
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  const commit = () => {
    if (allowEmpty && text.trim() === '') {
      if (value !== 0) onChange(0)
      return
    }
    let v = Number(text)
    if (!Number.isFinite(v)) {
      setText(show(value))
      return
    }
    if (min !== undefined) v = Math.max(min, v)
    if (max !== undefined) v = Math.min(max, v)
    setText(show(v))
    if (v !== value) onChange(v)
  }
  return (
    <div className={cn('relative', className)}>
      <Input
        className="h-7 pr-7 text-xs"
        inputMode="decimal"
        value={text}
        step={step}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      {suffix && (
        <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px] text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  )
}

export function ColorInput({ value, onChange, allowTransparent }: { value?: string; onChange: (v: string) => void; allowTransparent?: boolean }) {
  const transparent = !value || value === 'transparent'
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        className="h-7 w-9 cursor-pointer rounded border bg-transparent p-0.5"
        value={transparent ? '#ffffff' : value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="flex-1 font-mono text-[10px] text-muted-foreground">{transparent ? '透明' : value}</span>
      {allowTransparent && (
        <button
          className={cn('rounded border px-1.5 py-0.5 text-[10px]', transparent && 'border-primary text-primary')}
          onClick={() => onChange('transparent')}
        >
          透明
        </button>
      )}
    </div>
  )
}

export function SimpleSelect<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  value: T | undefined
  onChange: (v: T) => void
  options: Array<{ value: T; label: string }>
  placeholder?: string
  className?: string
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger size="sm" className={cn('h-7 w-full text-xs', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
