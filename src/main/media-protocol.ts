import { protocol } from 'electron'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { Readable } from 'stream'
import { extname, resolve, sep } from 'path'
import { MEDIA_SCHEME, AUDIO_EXTENSIONS } from '../shared/ipc'
import { AUDIUS_ID_PATTERN, audiusStreamEndpoint, resolveCoverUrl } from './audius'

/**
 * shengyu-media:// 协议
 *
 * 渲染进程不允许直接读盘，本地音频与封面统一通过该协议流式获取。
 * 关键点：
 *  - 手写 HTTP Range，`<audio>` 才能拖动进度（否则 seek 直接失败）；
 *  - 目录白名单 + 扩展名白名单，避免渲染层被注入后任意读文件；
 *  - 返回 CORS 头，配合 crossOrigin="anonymous"，
 *    保证 createMediaElementSource 不会因跨源污染而静音。
 */

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']

/**
 * 在线代理「拿到响应头」的超时。只管到响应头为止 —— 响应体不设时限，
 * 否则长曲目会在播放中途被掐断。
 */
const HEADERS_TIMEOUT = 12_000

const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wma': 'audio/x-ms-wma',
  '.webm': 'audio/webm',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.lrc': 'text/plain; charset=utf-8'
}

/** 允许读取的根目录集合（用户导入过的目录 + 封面缓存目录）。 */
const allowedRoots = new Set<string>()

export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        stream: true,
        supportFetchAPI: true,
        corsEnabled: true
      }
    }
  ])
}

export function allowRoot(dir: string): void {
  if (dir) allowedRoots.add(normalize(dir))
}

export function allowedRootList(): string[] {
  return [...allowedRoots]
}

export function forgetRoot(dir: string): void {
  allowedRoots.delete(normalize(dir))
}

/** 把绝对路径编成协议地址。base64url 可以安全承载中文路径与反斜杠。 */
export function toMediaUrl(filePath: string, kind: 'stream' | 'cover' = 'stream'): string {
  const token = Buffer.from(filePath, 'utf8').toString('base64url')
  return `${MEDIA_SCHEME}://${kind}/?src=${token}`
}

function normalize(dir: string): string {
  const abs = resolve(dir)
  return (abs.endsWith(sep) ? abs : abs + sep).toLowerCase()
}

function isAllowed(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase()
  const extOk =
    (AUDIO_EXTENSIONS as readonly string[]).includes(ext) ||
    IMAGE_EXTENSIONS.includes(ext) ||
    ext === '.lrc'
  if (!extOk) return false
  const abs = resolve(filePath).toLowerCase()
  for (const root of allowedRoots) if (abs.startsWith(root)) return true
  return false
}

function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, rawStart, rawEnd] = match
  let start: number
  let end: number
  if (rawStart === '') {
    // bytes=-N —— 末尾 N 字节
    const suffix = Number(rawEnd)
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(rawStart)
    end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1)
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null
  return { start, end }
}

/**
 * 在线音源代理：shengyu-media://remote/?id=<audiusId>&kind=stream|cover
 *
 * Audius 的流地址会跳到每个创作者节点各自的域名，写不出可信的 CSP 白名单，
 * 也拿不到稳定的 CORS 头。由主进程转发后，渲染层只看得到本地协议。
 * 这里只代理 Audius 这一个上游，且 id 需通过短哈希校验 —— 不是开放代理。
 */
async function handleRemoteMedia(url: URL, request: Request): Promise<Response> {
  const id = url.searchParams.get('id') ?? ''
  const kind = url.searchParams.get('kind') ?? ''
  if (!AUDIUS_ID_PATTERN.test(id)) return new Response('forbidden', { status: 403 })

  if (kind === 'cover') {
    const target = await resolveCoverUrl(id)
    if (!target) return new Response('cover not found', { status: 404 })
    const upstream = await fetch(target, { signal: AbortSignal.timeout(15000) })
    if (!upstream.ok) return new Response('upstream error', { status: 502 })
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400'
      }
    })
  }

  if (kind !== 'stream') return new Response('bad kind', { status: 400 })

  // Range 原样转给上游，<audio> 才能拖动进度 —— 实测跟随跳转时 Range 会保留
  const range = request.headers.get('Range')
  const headers: Record<string, string> = range ? { Range: range } : {}

  const upstream = await fetchStreamWithRetry(id, headers, request)
  if (!upstream) return new Response('upstream unreachable', { status: 502 })
  if (!upstream.ok && upstream.status !== 206) {
    return new Response('upstream error', { status: 502 })
  }

  const responseHeaders: Record<string, string> = {
    'Content-Type': upstream.headers.get('content-type') ?? 'audio/mpeg',
    // 有了它 createMediaElementSource 才不会因跨源污染而静音
    'Access-Control-Allow-Origin': '*',
    'Accept-Ranges': 'bytes'
  }
  for (const key of ['content-range', 'content-length']) {
    const value = upstream.headers.get(key)
    if (value) {
      responseHeaders[key === 'content-range' ? 'Content-Range' : 'Content-Length'] = value
    }
  }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
}

/**
 * 取流，带「仅连接阶段」的超时与一次重试。
 *
 * 超时只覆盖到响应头返回为止：一旦头到手就清掉定时器，长曲目的响应体不会被拦腰截断。
 * 没有这道闸，指向失联节点的曲目会让 <audio> 无限期挂起（实测 Audius 的某个
 * 创作者节点连不上）。
 *
 * 重试有意义是因为每次请求由发现节点重新选路，换一个节点往往就能通。
 */
async function fetchStreamWithRetry(
  id: string,
  headers: Record<string, string>,
  request: Request
): Promise<Response | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HEADERS_TIMEOUT)
    // 渲染层停止播放时 Chromium 会中断请求，据此回收上游连接
    const onRequestAbort = (): void => controller.abort()
    request.signal?.addEventListener('abort', onRequestAbort)
    try {
      return await fetch(audiusStreamEndpoint(id), {
        headers,
        redirect: 'follow',
        signal: controller.signal
      })
    } catch (error) {
      if (attempt === 1) {
        console.error(`[media] 在线曲目取流失败 id=${id}`, error)
        return null
      }
    } finally {
      clearTimeout(timer)
      request.signal?.removeEventListener('abort', onRequestAbort)
    }
  }
  return null
}

export function handleMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    let filePath = ''
    try {
      const url = new URL(request.url)
      if (url.hostname === 'remote') return await handleRemoteMedia(url, request)
      const token = url.searchParams.get('src')
      if (!token) return new Response('missing src', { status: 400 })
      filePath = Buffer.from(token, 'base64url').toString('utf8')

      if (!isAllowed(filePath)) {
        return new Response('forbidden', { status: 403 })
      }

      const info = await stat(filePath)
      if (!info.isFile()) return new Response('not a file', { status: 404 })

      const ext = extname(filePath).toLowerCase()
      const type = MIME[ext] ?? 'application/octet-stream'
      const headers: Record<string, string> = {
        'Content-Type': type,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      }

      const range = parseRange(request.headers.get('Range'), info.size)
      if (range) {
        const { start, end } = range
        headers['Content-Length'] = String(end - start + 1)
        headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`
        return new Response(toWebStream(filePath, start, end), { status: 206, headers })
      }

      headers['Content-Length'] = String(info.size)
      return new Response(toWebStream(filePath), { status: 200, headers })
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code
      if (code === 'ENOENT') return new Response('not found', { status: 404 })
      console.error('[media] failed to serve', filePath, error)
      return new Response('internal error', { status: 500 })
    }
  })
}

function toWebStream(filePath: string, start?: number, end?: number): ReadableStream {
  const stream = createReadStream(filePath, start === undefined ? undefined : { start, end })
  return Readable.toWeb(stream) as ReadableStream
}
