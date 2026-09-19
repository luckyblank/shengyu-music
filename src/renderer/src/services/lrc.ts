import type { LyricLine, ParsedLyrics } from '../types/music'

/**
 * LRC 歌词解析：
 *  - 支持 `[mm:ss.xx]` 与 `[mm:ss:xx]` 两种时间戳；
 *  - 支持一行多个时间戳（重复副歌）；
 *  - 支持元信息标签 [ar:] [ti:] [al:] [offset:]（offset 单位毫秒）。
 */

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
const WORD_TAG = /<(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?>/g

export function parseLrc(text: string, demo = false): ParsedLyrics {
  const meta: Record<string, string> = {}
  const raw: LyricLine[] = []
  let offset = 0

  for (const line of text.split(/\r?\n/)) {
    const tag = /^\[(\w+):(.*)\]$/.exec(line.trim())
    if (tag && !TIME_TAG.test(line)) {
      meta[tag[1].toLowerCase()] = tag[2].trim()
      continue
    }
    if (/^\[offset:(-?\d+)\]$/i.test(line.trim())) {
      const match = /^\[offset:(-?\d+)\]$/i.exec(line.trim())
      offset = Number(match?.[1] ?? 0)
      continue
    }
    TIME_TAG.lastIndex = 0
    const stamps: number[] = []
    let match: RegExpExecArray | null
    while ((match = TIME_TAG.exec(line)) !== null) {
      const minutes = Number(match[1])
      const seconds = Number(match[2])
      const fractionRaw = match[3] ?? '0'
      const fraction = Number(fractionRaw) / 10 ** fractionRaw.length
      stamps.push(Math.max(0, (minutes * 60 + seconds + fraction) * 1000))
    }
    TIME_TAG.lastIndex = 0
    const plain = line.replace(TIME_TAG, '')

    // 逐字标签：<mm:ss.xx>词 — 卡拉OK时间轴（增强 LRC）
    WORD_TAG.lastIndex = 0
    const words: LyricLine['words'] = []
    let lastWordIndex = 0
    let lastWordTime = 0
    while ((match = WORD_TAG.exec(plain)) !== null) {
      const wordTime =
        (Number(match[1]) * 60 + Number(match[2]) + Number(`0.${match[3] ?? 0}`)) * 1000
      const wordText = plain.slice(lastWordIndex, match.index).trim()
      if (wordText) {
        words.push({ offset: wordTime, text: wordText })
      } else if (words.length && lastWordTime) {
        words[words.length - 1].text += plain.slice(lastWordIndex, match.index)
      }
      lastWordIndex = match.index + match[0].length
      lastWordTime = wordTime
    }
    WORD_TAG.lastIndex = 0
    const tail = plain.slice(lastWordIndex).replace(WORD_TAG, '').trim()
    if (tail && lastWordTime) {
      words.push({ offset: lastWordTime, text: tail })
    }

    const text = plain.replace(WORD_TAG, '').trim()
    for (const time of stamps) {
      raw.push(words.length ? { time: time + offset, text, words } : { time: time + offset, text })
    }
  }

  raw.sort((a, b) => a.time - b.time)
  return { lines: raw, demo, meta }
}

/** 为没有逐字时间轴的歌词行生成均匀分布的卡拉OK时间轴（演示曲使用）。 */
export function distributeWords(line: LyricLine, durationMs: number): LyricLine['words'] {
  const tokens = line.text.split(/(\s+)/).filter((token) => token.length > 0)
  if (tokens.length <= 1) return undefined
  const step = durationMs / tokens.length
  return tokens.map((token, index) => ({ offset: Math.round(index * step), text: token }))
}

export function emptyLyrics(): ParsedLyrics {
  return { lines: [], demo: false, meta: {} }
}
