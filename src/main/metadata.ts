import { createHash } from 'crypto'
import { open, mkdir, writeFile, access } from 'fs/promises'
import type { FileHandle } from 'fs/promises'
import { basename, extname, join } from 'path'

/**
 * 轻量音频标签解析：ID3v2 / ID3v1 / FLAC / MP4(M4A) / WAV。
 *
 * 只读文件头部所需字节，不做整文件解码；解析失败一律回落到文件名，
 * 保证"导入永远不会因为一个坏标签而失败"。
 */

export interface ParsedTags {
  title?: string
  artist?: string
  album?: string
  trackNo?: number
  year?: string
  /** 从容器头精确算出的时长（秒），拿不到则为 0 */
  duration: number
  sampleRate?: number
  bitrate?: number
  picture?: { data: Buffer; mime: string }
}

const MAX_TAG_BYTES = 24 * 1024 * 1024

export async function readTags(filePath: string, fileSize: number): Promise<ParsedTags> {
  const ext = extname(filePath).toLowerCase()
  let handle: FileHandle | undefined
  try {
    handle = await open(filePath, 'r')
    const head = await readAt(handle, 0, Math.min(64, fileSize))

    if (head.length >= 3 && head.toString('latin1', 0, 3) === 'ID3') {
      const tags = await readId3v2(handle, fileSize)
      if (ext === '.mp3' && !tags.duration) {
        tags.duration = await readMpegDuration(handle, fileSize, tags.audioStart ?? 0)
      }
      if (!tags.title || !tags.artist) Object.assign(tags, mergeFallback(tags, filePath))
      return tags
    }
    if (head.length >= 4 && head.toString('latin1', 0, 4) === 'fLaC') {
      const tags = await readFlac(handle, fileSize)
      return { ...tags, ...mergeFallback(tags, filePath) }
    }
    if (head.length >= 12 && head.toString('latin1', 4, 8) === 'ftyp') {
      const tags = await readMp4(handle, fileSize)
      return { ...tags, ...mergeFallback(tags, filePath) }
    }
    if (head.length >= 12 && head.toString('latin1', 0, 4) === 'RIFF') {
      const tags = await readWav(handle, fileSize)
      return { ...tags, ...mergeFallback(tags, filePath) }
    }
    if (ext === '.mp3') {
      const duration = await readMpegDuration(handle, fileSize, 0)
      const v1 = await readId3v1(handle, fileSize)
      return { duration, ...v1, ...mergeFallback(v1, filePath) }
    }
    return { duration: 0, ...fromFileName(filePath) }
  } catch {
    return { duration: 0, ...fromFileName(filePath) }
  } finally {
    await handle?.close()
  }
}

/** 把内嵌封面写入缓存目录，返回缓存文件绝对路径。 */
export async function cachePicture(
  cacheDir: string,
  filePath: string,
  fingerprint: string,
  picture: { data: Buffer; mime: string }
): Promise<string> {
  const ext = picture.mime.includes('png')
    ? '.png'
    : picture.mime.includes('webp')
      ? '.webp'
      : picture.mime.includes('gif')
        ? '.gif'
        : '.jpg'
  const name = createHash('sha1').update(`${filePath}:${fingerprint}`).digest('hex') + ext
  const target = join(cacheDir, name)
  try {
    await access(target)
    return target
  } catch {
    await mkdir(cacheDir, { recursive: true })
    await writeFile(target, picture.data)
    return target
  }
}

/* ------------------------------- 通用工具 ------------------------------- */

async function readAt(handle: FileHandle, position: number, length: number): Promise<Buffer> {
  if (length <= 0) return Buffer.alloc(0)
  const buffer = Buffer.alloc(length)
  const { bytesRead } = await handle.read(buffer, 0, length, position)
  return buffer.subarray(0, bytesRead)
}

function fromFileName(filePath: string): { title: string; artist: string; album: string } {
  const raw = basename(filePath, extname(filePath)).trim()
  // 常见命名："艺人 - 标题"、"01. 标题"、"01 - 艺人 - 标题"
  const stripped = raw.replace(/^\s*\d{1,3}\s*[.\-_、]\s*/, '')
  const parts = stripped.split(/\s+-\s+|\s+–\s+/)
  if (parts.length >= 2) {
    const artist = parts[0].trim()
    const title = parts.slice(1).join(' - ').trim()
    if (artist && title) return { title, artist, album: '本地音乐' }
  }
  return { title: stripped || raw, artist: '未知艺人', album: '本地音乐' }
}

function mergeFallback(tags: Partial<ParsedTags>, filePath: string): Partial<ParsedTags> {
  const fallback = fromFileName(filePath)
  return {
    title: clean(tags.title) ?? fallback.title,
    artist: clean(tags.artist) ?? fallback.artist,
    album: clean(tags.album) ?? fallback.album
  }
}

function clean(value?: string): string | undefined {
  // ID3 文本帧常以 \x00 填充结尾，直接按空字符切分取第一段。
  const trimmed = value?.split(String.fromCharCode(0))[0]?.trim()
  return trimmed ? trimmed : undefined
}

function decodeText(buffer: Buffer, encoding: number): string {
  switch (encoding) {
    case 1: {
      if (buffer.length >= 2) {
        const bom = buffer.readUInt16LE(0)
        if (bom === 0xfeff) return buffer.subarray(2).toString('utf16le')
        if (bom === 0xfffe) return swap16(buffer.subarray(2)).toString('utf16le')
      }
      return buffer.toString('utf16le')
    }
    case 2:
      return swap16(buffer).toString('utf16le')
    case 3:
      return buffer.toString('utf8')
    default: {
      // ID3v2 标称 latin1，但中文歌大量使用 GBK 写入；含高位字节时优先按 UTF-8 试探。
      const latin = buffer.toString('latin1')
      const utf8 = buffer.toString('utf8')
      return utf8.includes('�') ? latin : utf8
    }
  }
}

function swap16(buffer: Buffer): Buffer {
  const copy = Buffer.from(buffer)
  if (copy.length % 2 === 1) return copy.subarray(0, copy.length - 1).swap16()
  return copy.swap16()
}

/* --------------------------------- ID3 --------------------------------- */

type Id3Result = ParsedTags & { audioStart?: number }

async function readId3v2(handle: FileHandle, fileSize: number): Promise<Id3Result> {
  const header = await readAt(handle, 0, 10)
  const major = header[3]
  const flags = header[5]
  const size = syncSafe(header, 6)
  const tagEnd = Math.min(10 + size, MAX_TAG_BYTES)
  const body = await readAt(handle, 10, tagEnd - 10)
  const result: Id3Result = { duration: 0, audioStart: 10 + size }

  let offset = 0
  if (flags & 0x40) {
    // 扩展头
    const extSize = major >= 4 ? syncSafe(body, 0) : body.readUInt32BE(0) + 4
    offset += extSize
  }

  const idLength = major === 2 ? 3 : 4
  while (offset + idLength + (major === 2 ? 3 : 6) <= body.length) {
    const id = body.toString('latin1', offset, offset + idLength)
    if (!/^[A-Z0-9]{3,4}$/.test(id)) break
    let frameSize: number
    let headerSize: number
    if (major === 2) {
      frameSize = (body[offset + 3] << 16) | (body[offset + 4] << 8) | body[offset + 5]
      headerSize = 6
    } else {
      frameSize = major >= 4 ? syncSafe(body, offset + 4) : body.readUInt32BE(offset + 4)
      headerSize = 10
    }
    if (frameSize <= 0 || offset + headerSize + frameSize > body.length) break
    const frame = body.subarray(offset + headerSize, offset + headerSize + frameSize)
    applyId3Frame(result, id, frame)
    offset += headerSize + frameSize
  }

  if (!result.title || !result.artist) {
    const v1 = await readId3v1(handle, fileSize)
    result.title ??= v1.title
    result.artist ??= v1.artist
    result.album ??= v1.album
  }
  return result
}

function applyId3Frame(result: Id3Result, id: string, frame: Buffer): void {
  const text = (): string => decodeText(frame.subarray(1), frame[0])
  switch (id) {
    case 'TIT2':
    case 'TT2':
      result.title = text()
      break
    case 'TPE1':
    case 'TP1':
      result.artist = text()
      break
    case 'TALB':
    case 'TAL':
      result.album = text()
      break
    case 'TRCK':
    case 'TRK':
      result.trackNo = parseInt(text(), 10) || undefined
      break
    case 'TYER':
    case 'TDRC':
    case 'TYE':
      result.year = text().slice(0, 4)
      break
    case 'TLEN': {
      const ms = parseInt(text(), 10)
      if (ms > 0) result.duration = ms / 1000
      break
    }
    case 'APIC':
    case 'PIC': {
      if (result.picture) break
      const encoding = frame[0]
      let cursor = 1
      let mime = 'image/jpeg'
      if (id === 'APIC') {
        const end = frame.indexOf(0, cursor)
        if (end < 0) return
        mime = frame.toString('latin1', cursor, end) || mime
        cursor = end + 1
      } else {
        mime = `image/${frame.toString('latin1', cursor, cursor + 3).toLowerCase()}`
        cursor += 3
      }
      cursor += 1 // picture type
      // 描述字段，按编码决定终止符宽度
      if (encoding === 1 || encoding === 2) {
        while (cursor + 1 < frame.length && !(frame[cursor] === 0 && frame[cursor + 1] === 0))
          cursor += 2
        cursor += 2
      } else {
        const end = frame.indexOf(0, cursor)
        cursor = end < 0 ? frame.length : end + 1
      }
      const data = frame.subarray(cursor)
      if (data.length > 128) result.picture = { data: Buffer.from(data), mime }
      break
    }
  }
}

function syncSafe(buffer: Buffer, offset: number): number {
  return (
    ((buffer[offset] & 0x7f) << 21) |
    ((buffer[offset + 1] & 0x7f) << 14) |
    ((buffer[offset + 2] & 0x7f) << 7) |
    (buffer[offset + 3] & 0x7f)
  )
}

async function readId3v1(handle: FileHandle, fileSize: number): Promise<Partial<ParsedTags>> {
  if (fileSize < 128) return {}
  const tail = await readAt(handle, fileSize - 128, 128)
  if (tail.toString('latin1', 0, 3) !== 'TAG') return {}
  const field = (start: number, length: number): string | undefined =>
    clean(decodeText(tail.subarray(start, start + length), 0))
  return {
    title: field(3, 30),
    artist: field(33, 30),
    album: field(63, 30),
    year: field(93, 4)
  }
}

/** MPEG 帧头 + Xing/Info 帧计数，拿不到就按 CBR 估算。 */
async function readMpegDuration(
  handle: FileHandle,
  fileSize: number,
  audioStart: number
): Promise<number> {
  const window = await readAt(handle, audioStart, Math.min(64 * 1024, fileSize - audioStart))
  const sync = findFrameSync(window)
  if (sync < 0) return 0

  const header = window.readUInt32BE(sync)
  const versionBits = (header >> 19) & 0b11
  const layer = (header >> 17) & 0b11
  const bitrateIndex = (header >> 12) & 0b1111
  const sampleRateIndex = (header >> 10) & 0b11
  const channelMode = (header >> 6) & 0b11

  const sampleRates = [
    [11025, 12000, 8000], // MPEG 2.5
    [0, 0, 0],
    [22050, 24000, 16000], // MPEG 2
    [44100, 48000, 32000] // MPEG 1
  ][versionBits]
  const sampleRate = sampleRates?.[sampleRateIndex] ?? 0
  if (!sampleRate || layer !== 0b01) return 0

  const bitrates =
    versionBits === 0b11
      ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
      : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
  const bitrate = bitrates[bitrateIndex] * 1000
  const samplesPerFrame = versionBits === 0b11 ? 1152 : 576

  // Xing / Info（VBR 头）位置取决于声道模式与 MPEG 版本
  const sideInfo =
    versionBits === 0b11 ? (channelMode === 0b11 ? 17 : 32) : channelMode === 0b11 ? 9 : 17
  const xingOffset = sync + 4 + sideInfo
  const marker = window.toString('latin1', xingOffset, xingOffset + 4)
  if (marker === 'Xing' || marker === 'Info') {
    const flags = window.readUInt32BE(xingOffset + 4)
    if (flags & 0x1) {
      const frames = window.readUInt32BE(xingOffset + 8)
      if (frames > 0) return (frames * samplesPerFrame) / sampleRate
    }
  }
  if (!bitrate) return 0
  return ((fileSize - audioStart) * 8) / bitrate
}

function findFrameSync(buffer: Buffer): number {
  for (let i = 0; i + 4 < buffer.length; i++) {
    if (buffer[i] === 0xff && (buffer[i + 1] & 0xe0) === 0xe0) return i
  }
  return -1
}

/* --------------------------------- FLAC -------------------------------- */

async function readFlac(handle: FileHandle, fileSize: number): Promise<ParsedTags> {
  const result: ParsedTags = { duration: 0 }
  let offset = 4
  for (let guard = 0; guard < 64; guard++) {
    if (offset + 4 > fileSize) break
    const header = await readAt(handle, offset, 4)
    const isLast = (header[0] & 0x80) !== 0
    const type = header[0] & 0x7f
    const length = (header[1] << 16) | (header[2] << 8) | header[3]
    const bodyStart = offset + 4
    if (length > 0 && length < MAX_TAG_BYTES) {
      if (type === 0) {
        const b = await readAt(handle, bodyStart, Math.min(length, 34))
        // STREAMINFO：20bit 采样率 + 3bit 声道 + 5bit 位深 + 36bit 总采样数
        const sampleRate = (b[10] << 12) | (b[11] << 4) | (b[12] >> 4)
        const highNibble = b[13] & 0x0f
        const lowWord = (((b[14] << 24) | (b[15] << 16) | (b[16] << 8) | b[17]) >>> 0) as number
        const total = highNibble * 2 ** 32 + lowWord
        result.sampleRate = sampleRate || undefined
        if (sampleRate > 0 && total > 0) result.duration = total / sampleRate
      } else if (type === 4) {
        applyVorbisComment(await readAt(handle, bodyStart, length), result)
      } else if (type === 6 && !result.picture) {
        const b = await readAt(handle, bodyStart, length)
        let cursor = 4
        const mimeLength = b.readUInt32BE(cursor)
        cursor += 4
        const mime = b.toString('latin1', cursor, cursor + mimeLength)
        cursor += mimeLength
        const descLength = b.readUInt32BE(cursor)
        cursor += 4 + descLength + 16
        const dataLength = b.readUInt32BE(cursor)
        cursor += 4
        const data = b.subarray(cursor, cursor + dataLength)
        if (data.length > 128) result.picture = { data: Buffer.from(data), mime }
      }
    }
    if (isLast) break
    offset = bodyStart + length
  }
  if (result.duration > 0) result.bitrate = Math.round((fileSize * 8) / result.duration)
  return result
}

function applyVorbisComment(body: Buffer, result: ParsedTags): void {
  let cursor = 0
  const vendorLength = body.readUInt32LE(cursor)
  cursor += 4 + vendorLength
  if (cursor + 4 > body.length) return
  const count = body.readUInt32LE(cursor)
  cursor += 4
  for (let i = 0; i < count && cursor + 4 <= body.length; i++) {
    const length = body.readUInt32LE(cursor)
    cursor += 4
    const entry = body.toString('utf8', cursor, cursor + length)
    cursor += length
    const eq = entry.indexOf('=')
    if (eq < 0) continue
    const key = entry.slice(0, eq).toUpperCase()
    const value = entry.slice(eq + 1)
    if (key === 'TITLE') result.title ??= value
    else if (key === 'ARTIST') result.artist ??= value
    else if (key === 'ALBUM') result.album ??= value
    else if (key === 'DATE') result.year ??= value.slice(0, 4)
    else if (key === 'TRACKNUMBER') result.trackNo ??= parseInt(value, 10) || undefined
  }
}

/* -------------------------------- MP4/M4A ------------------------------ */

async function readMp4(handle: FileHandle, fileSize: number): Promise<ParsedTags> {
  const result: ParsedTags = { duration: 0 }
  await walkAtoms(handle, 0, Math.min(fileSize, Number.MAX_SAFE_INTEGER), result, 0)
  return result
}

async function walkAtoms(
  handle: FileHandle,
  start: number,
  end: number,
  result: ParsedTags,
  depth: number
): Promise<void> {
  if (depth > 6) return
  let offset = start
  while (offset + 8 <= end) {
    const header = await readAt(handle, offset, 8)
    if (header.length < 8) return
    let size = header.readUInt32BE(0)
    const type = header.toString('latin1', 4, 8)
    let bodyStart = offset + 8
    if (size === 1) {
      const ext = await readAt(handle, offset + 8, 8)
      size = Number(ext.readBigUInt64BE(0))
      bodyStart = offset + 16
    } else if (size === 0) {
      size = end - offset
    }
    if (size < 8) return
    const bodyEnd = Math.min(offset + size, end)

    if (type === 'moov' || type === 'trak' || type === 'mdia' || type === 'udta') {
      await walkAtoms(handle, bodyStart, bodyEnd, result, depth + 1)
    } else if (type === 'meta') {
      await walkAtoms(handle, bodyStart + 4, bodyEnd, result, depth + 1)
    } else if (type === 'ilst') {
      await readIlst(handle, bodyStart, bodyEnd, result)
    } else if (type === 'mvhd') {
      const b = await readAt(handle, bodyStart, Math.min(bodyEnd - bodyStart, 32))
      const version = b[0]
      if (version === 1 && b.length >= 32) {
        const timescale = b.readUInt32BE(20)
        const duration = Number(b.readBigUInt64BE(24))
        if (timescale) result.duration = duration / timescale
      } else if (b.length >= 20) {
        const timescale = b.readUInt32BE(12)
        const duration = b.readUInt32BE(16)
        if (timescale) result.duration = duration / timescale
      }
    }
    offset += size
  }
}

async function readIlst(
  handle: FileHandle,
  start: number,
  end: number,
  result: ParsedTags
): Promise<void> {
  let offset = start
  while (offset + 8 <= end) {
    const header = await readAt(handle, offset, 8)
    const size = header.readUInt32BE(0)
    const name = header.toString('latin1', 4, 8)
    if (size < 8) return
    const body = await readAt(handle, offset + 8, Math.min(size - 8, MAX_TAG_BYTES))
    // 内层是 data atom：size(4) 'data'(4) version/flags(4) locale(4) payload
    if (body.length > 16 && body.toString('latin1', 4, 8) === 'data') {
      const dataType = body.readUInt32BE(8) & 0xffffff
      const payload = body.subarray(16)
      const text = (): string => payload.toString('utf8')
      if (name === '©nam') result.title ??= text()
      else if (name === '©ART' || name === 'aART') result.artist ??= text()
      else if (name === '©alb') result.album ??= text()
      else if (name === '©day') result.year ??= text().slice(0, 4)
      else if (name === 'trkn' && payload.length >= 4) result.trackNo ??= payload.readUInt16BE(2)
      else if (name === 'covr' && !result.picture && payload.length > 128) {
        result.picture = {
          data: Buffer.from(payload),
          mime: dataType === 14 ? 'image/png' : 'image/jpeg'
        }
      }
    }
    offset += size
  }
}

/* ---------------------------------- WAV -------------------------------- */

async function readWav(handle: FileHandle, fileSize: number): Promise<ParsedTags> {
  const result: ParsedTags = { duration: 0 }
  let offset = 12
  let byteRate = 0
  while (offset + 8 <= fileSize) {
    const header = await readAt(handle, offset, 8)
    if (header.length < 8) break
    const id = header.toString('latin1', 0, 4)
    const size = header.readUInt32LE(4)
    if (id === 'fmt ') {
      const b = await readAt(handle, offset + 8, Math.min(size, 16))
      result.sampleRate = b.readUInt32LE(4)
      byteRate = b.readUInt32LE(8)
      result.bitrate = byteRate * 8
    } else if (id === 'data') {
      if (byteRate > 0) result.duration = size / byteRate
      break
    }
    offset += 8 + size + (size % 2)
  }
  return result
}
