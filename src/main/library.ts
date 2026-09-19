import { app, dialog, shell, BrowserWindow } from 'electron'
import { readdir, stat, readFile, access } from 'fs/promises'
import { createHash } from 'crypto'
import { dirname, extname, join, resolve } from 'path'
import {
  AUDIO_EXTENSIONS,
  type ImportResult,
  type LocalTrackMeta,
  type LyricsPickResult
} from '../shared/ipc'
import { allowRoot, toMediaUrl } from './media-protocol'
import { cachePicture, readTags } from './metadata'

/**
 * 本地曲库接入：选择文件/文件夹、递归扫描、标签解析、封面缓存、歌词侧车发现。
 * 扫描是"尽力而为"的：单个文件失败只计入 skipped，不中断整批导入。
 */

const MAX_DEPTH = 6
const MAX_FILES = 4000
const SKIP_DIRS = new Set(['node_modules', '.git', '$recycle.bin', 'system volume information'])

const coverDir = (): string => join(app.getPath('userData'), 'covers')

export async function pickFiles(window: BrowserWindow | null): Promise<ImportResult> {
  const result = await dialog.showOpenDialog(window ?? undefined!, {
    title: '导入音乐文件',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '音频文件', extensions: AUDIO_EXTENSIONS.map((ext) => ext.slice(1)) },
      { name: '全部文件', extensions: ['*'] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) {
    return { tracks: [], canceled: true, skipped: 0, roots: [] }
  }
  return importPaths(result.filePaths)
}

export async function pickFolder(window: BrowserWindow | null): Promise<ImportResult> {
  const result = await dialog.showOpenDialog(window ?? undefined!, {
    title: '导入音乐文件夹',
    properties: ['openDirectory', 'multiSelections']
  })
  if (result.canceled || result.filePaths.length === 0) {
    return { tracks: [], canceled: true, skipped: 0, roots: [] }
  }
  return importPaths(result.filePaths)
}

/** 供拖放导入与启动恢复复用：接受文件与目录混合列表。 */
export async function importPaths(paths: string[]): Promise<ImportResult> {
  const files: string[] = []
  const roots = new Set<string>()

  for (const input of paths) {
    try {
      const info = await stat(input)
      if (info.isDirectory()) {
        roots.add(resolve(input))
        await collect(input, files, 0)
      } else if (isAudio(input)) {
        roots.add(dirname(resolve(input)))
        files.push(resolve(input))
      }
    } catch {
      /* 路径不可访问，忽略 */
    }
    if (files.length >= MAX_FILES) break
  }

  for (const root of roots) allowRoot(root)
  allowRoot(coverDir())

  const tracks: LocalTrackMeta[] = []
  let skipped = 0
  const seen = new Set<string>()

  for (const file of files.slice(0, MAX_FILES)) {
    if (seen.has(file.toLowerCase())) continue
    seen.add(file.toLowerCase())
    try {
      tracks.push(await describe(file))
    } catch {
      skipped += 1
    }
  }

  tracks.sort((a, b) => a.path.localeCompare(b.path, 'zh-Hans-CN'))
  return { tracks, canceled: false, skipped, roots: [...roots] }
}

/** 重新校验持久化的曲库条目，返回仍然存在的路径集合。 */
export async function checkPaths(paths: string[]): Promise<Record<string, boolean>> {
  const map: Record<string, boolean> = {}
  await Promise.all(
    paths.map(async (path) => {
      try {
        await access(path)
        allowRoot(dirname(path))
        map[path] = true
      } catch {
        map[path] = false
      }
    })
  )
  allowRoot(coverDir())
  return map
}

export async function readLyrics(path: string): Promise<string | null> {
  try {
    const buffer = await readFile(path)
    return decodeLyrics(buffer)
  } catch {
    return null
  }
}

/** 选择 .lrc/.txt 歌词文件并读回文本（供任意曲目手动挂载歌词）。 */
export async function pickLyricsFile(window: BrowserWindow | null): Promise<LyricsPickResult> {
  const result = await dialog.showOpenDialog(window ?? undefined!, {
    title: '导入 LRC 歌词文件',
    properties: ['openFile'],
    filters: [
      { name: '歌词文件', extensions: ['lrc', 'txt'] },
      { name: '全部文件', extensions: ['*'] }
    ]
  })
  if (result.canceled || !result.filePaths.length) {
    return { canceled: true, path: null, text: null }
  }
  const path = resolve(result.filePaths[0])
  try {
    const buffer = await readFile(path)
    return { canceled: false, path, text: decodeLyrics(buffer) }
  } catch (error) {
    return { canceled: false, path, text: null }
  }
}

function decodeLyrics(buffer: Buffer): string {
  // LRC 常见 UTF-8 / GBK；有 BOM 按 UTF-8，否则按 UTF-8 解，乱码再退回 latin1。
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf8')
  }
  const text = buffer.toString('utf8')
  return text.includes('�') ? buffer.toString('latin1') : text
}

export function revealInFolder(path: string): void {
  shell.showItemInFolder(resolve(path))
}

/* ------------------------------- 内部实现 ------------------------------- */

function isAudio(file: string): boolean {
  return (AUDIO_EXTENSIONS as readonly string[]).includes(extname(file).toLowerCase())
}

async function collect(dir: string, out: string[], depth: number): Promise<void> {
  if (depth > MAX_DEPTH || out.length >= MAX_FILES) return
  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (out.length >= MAX_FILES) return
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name.toLowerCase())) continue
      await collect(full, out, depth + 1)
    } else if (entry.isFile() && isAudio(full)) {
      out.push(resolve(full))
    }
  }
}

async function describe(file: string): Promise<LocalTrackMeta> {
  const info = await stat(file)
  const fingerprint = `${info.size}:${Math.round(info.mtimeMs)}`
  const tags = await readTags(file, info.size)

  let coverUrl: string | undefined
  if (tags.picture) {
    try {
      const cached = await cachePicture(coverDir(), file, fingerprint, tags.picture)
      coverUrl = toMediaUrl(cached, 'cover')
    } catch {
      coverUrl = undefined
    }
  }

  const lyricsPath = await findLyrics(file)

  return {
    id: `local-${createHash('sha1').update(file.toLowerCase()).digest('hex').slice(0, 16)}`,
    path: file,
    url: toMediaUrl(file),
    title: tags.title ?? file,
    artist: tags.artist ?? '未知艺人',
    album: tags.album ?? '本地音乐',
    duration: Math.max(0, Math.round((tags.duration ?? 0) * 10) / 10),
    format: extname(file).slice(1).toUpperCase(),
    size: info.size,
    modifiedAt: Math.round(info.mtimeMs),
    coverUrl,
    lyricsPath,
    trackNo: tags.trackNo,
    year: tags.year,
    sampleRate: tags.sampleRate,
    bitrate: tags.bitrate
  }
}

async function findLyrics(file: string): Promise<string | undefined> {
  const base = file.slice(0, file.length - extname(file).length)
  for (const candidate of [`${base}.lrc`, `${base}.LRC`]) {
    try {
      await access(candidate)
      return candidate
    } catch {
      /* 继续尝试 */
    }
  }
  return undefined
}
