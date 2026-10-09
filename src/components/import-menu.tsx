import { ClipboardPaste, FileImage, Files, FolderOpen, ImagePlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { modKey } from '@/lib/shortcuts'
import { clipboardPaths, isUtools, pickAnyFiles, pickFolders, pickImageFiles, envProblem } from '@/lib/bridge'

interface Props {
  onPaths: (paths: string[]) => void
  /** 自定义剪贴板导入（默认只取剪贴板中的文件） */
  onClipboard?: () => void
  label?: string
  size?: 'sm' | 'default'
  variant?: 'default' | 'outline' | 'secondary'
}

/** 多图片 / 文件夹 / 多文件 / 剪贴板 四种来源 */
export function ImportMenu({ onPaths, onClipboard, label = '添加图片', size = 'sm', variant = 'default' }: Props) {
  const run = (fn: () => string[]) => {
    if (!isUtools()) {
      toast.error(envProblem() ?? '运行环境异常')
      return
    }
    const paths = fn()
    if (paths.length) onPaths(paths)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size} variant={variant}>
          <ImagePlus /> {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => run(pickImageFiles)}>
          <FileImage /> 选择图片（多选）
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run(pickFolders)}>
          <FolderOpen /> 选择文件夹
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run(pickAnyFiles)}>
          <Files /> 选择文件（自动过滤图片）
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            onClipboard ? onClipboard() : run(() => {
              const p = clipboardPaths()
              if (!p.length) toast.warning('剪贴板里没有文件')
              return p
            })
          }
        >
          <ClipboardPaste /> 从剪贴板粘贴
          <span className="ml-auto pl-3 text-[10px] text-muted-foreground">{modKey}V</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
