import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { importPaths } from '../stores/library'

/**
 * 全窗口拖放导入。
 *
 * 用深度计数而不是布尔值：dragenter/dragleave 会在元素之间反复触发，
 * 用布尔值会导致遮罩闪烁。
 */
export function useFileDrop(): { dragDepth: Ref<number> } {
  const dragDepth = ref(0)

  const onDragEnter = (event: DragEvent): void => {
    if (!event.dataTransfer?.types.includes('Files')) return
    dragDepth.value += 1
  }

  const onDragLeave = (): void => {
    dragDepth.value = Math.max(0, dragDepth.value - 1)
  }

  const onDragOver = (event: DragEvent): void => {
    if (!event.dataTransfer?.types.includes('Files')) return
    event.preventDefault()
  }

  const onDrop = async (event: DragEvent): Promise<void> => {
    event.preventDefault()
    dragDepth.value = 0
    const files = [...(event.dataTransfer?.files ?? [])]
    if (!files.length) return
    const paths = files.map((file) => window.shengyu.pathForFile(file)).filter(Boolean)
    if (!paths.length) return
    const added = await importPaths(paths)
    if (added > 0) window.ui?.toast?.('拖入的音频已导入曲库', 'success')
  }

  onMounted(() => {
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('dragenter', onDragEnter)
    window.removeEventListener('dragleave', onDragLeave)
    window.removeEventListener('dragover', onDragOver)
    window.removeEventListener('drop', onDrop)
  })

  return { dragDepth }
}
