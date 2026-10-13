import { AlertTriangle, RotateCw } from 'lucide-react'
import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

/** 页面级错误边界：某个页面出错时只影响这一页，显示原因和重试按钮，不让整个插件白屏 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[快拼图] 页面出错', error)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="size-6 text-amber-500" />
        <div className="text-sm font-medium">这个页面出错了</div>
        <p className="max-w-md break-all text-xs text-muted-foreground">{error.message || String(error)}</p>
        <Button size="sm" variant="outline" onClick={() => this.setState({ error: null })}>
          <RotateCw /> 重试
        </Button>
      </div>
    )
  }
}
