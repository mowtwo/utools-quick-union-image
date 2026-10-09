import { useCallback } from 'react'
import { toast } from 'sonner'
import { errorMessage, importDataUrl, importPaths, PERMISSION_HINT, services, toImageItem, TRAY_THUMB, type ImportFailure } from '@/lib/bridge'

export { PERMISSION_HINT }
import { useStore } from '@/store'

const baseName = (p: string) => p.split(/[\\/]/).pop()

/** macOS 不允许读取其他应用沙盒内的文件（如微信的临时图片） */
const isPermissionError = (f: ImportFailure) => /EPERM|EACCES|operation not permitted|permission denied/i.test(f.reason)

function reportFailures(failed: ImportFailure[]) {
  if (!failed.length) return
  console.error('[导入失败]', failed)
  const denied = failed.some(isPermissionError)
  toast.error(`${failed.length} 个文件导入失败`, {
    description:
      failed
        .slice(0, 3)
        .map((f) => `${baseName(f.path)}：${f.reason}`)
        .join('\n') + (denied ? `\n${PERMISSION_HINT}` : ''),
  })
}

interface ImportOptions {
  replace?: boolean
  recursive?: boolean
  dataUrl?: string
  /** 剪贴板位图等原始字节 */
  bytes?: Uint8Array
  quiet?: boolean
}

/** 导入图片到图片栏 */
export function useImport() {
  const addImages = useStore((s) => s.addImages)
  const setBusy = useStore((s) => s.setBusy)

  const importInto = useCallback(
    async (paths: string[], opts: ImportOptions = {}) => {
      if (!paths.length && !opts.dataUrl && !opts.bytes) return { added: 0, failed: [] as ImportFailure[] }
      setBusy('导入图片…')
      const failed: ImportFailure[] = []
      try {
        const items = []
        if (opts.dataUrl) items.push(toImageItem(await importDataUrl(opts.dataUrl)))
        if (opts.bytes) items.push(toImageItem(await services().importBytes(opts.bytes, '粘贴的图片', TRAY_THUMB)))
        if (paths.length) {
          const res = await importPaths(paths, {
            recursive: opts.recursive,
            onProgress: (d, t) => setBusy(`导入图片 ${d}/${t}`),
          })
          items.push(...res.images.map(toImageItem))
          failed.push(...res.failed)
        }
        if (!opts.quiet) reportFailures(failed)
        if (!items.length) {
          if (!opts.quiet && !failed.length) toast.warning('没有找到可用的图片')
          return { added: 0, failed }
        }
        addImages(items, opts.replace)
        toast.success(`已导入 ${items.length} 张图片`)
        return { added: items.length, failed }
      } catch (err) {
        toast.error('导入失败', { description: errorMessage(err) })
        return { added: 0, failed }
      } finally {
        setBusy(null)
      }
    },
    [addImages, setBusy],
  )

  return importInto
}

/**
 * 粘贴：优先取剪贴板中的文件；文件读不到（沙盒权限）或没有文件时，退回剪贴板位图。
 */
export function usePaste() {
  const importInto = useImport()
  return useCallback(async () => {
    const u = window.utools
    if (!u || !window.services) return
    const paths = (u.getCopiedFiles() ?? []).map((f) => f.path)
    const image = () => {
      try {
        return services().readClipboardImage()
      } catch {
        return null
      }
    }
    if (paths.length) {
      const res = await importInto(paths, { quiet: true })
      if (!res.failed.length) return
      // 读不到的文件（如微信复制的图片）改用剪贴板里的位图，只有一张
      const bytes = res.failed.some(isPermissionError) ? image() : null
      if (bytes) {
        await importInto([], { bytes })
        const rest = res.failed.length - 1
        if (rest > 0) reportFailures(res.failed.slice(1))
      } else {
        reportFailures(res.failed)
      }
      return
    }
    const bytes = image()
    if (bytes) await importInto([], { bytes })
    else toast.warning('剪贴板里没有图片或文件')
  }, [importInto])
}
