import { watch } from 'vue'
import { demoLyrics } from '../data/catalog'
import { parseLrc, distributeWords } from './lrc'
import * as player from '../stores/player'
import { customLyrics } from '../stores/library'
import type { LyricLine, Track } from '../types/music'

/**
 * 全局歌词跟踪器：始终跟随当前播放曲目，把当前/下一句歌词行（含逐字时间轴）
 * 经主进程广播给桌面歌词悬浮窗。与 LyricsPane 的加载逻辑同源，
 * 但独立运行（面板关闭时桌面歌词照常工作）。
 */

let lines: LyricLine[] = []
let lastReported = -1
let started = false

const formatStamp = (ms: number): string => {
  const minutes = Math.floor(ms / 60000)
  const seconds = ((ms % 60000) / 1000).toFixed(2)
  return `${String(minutes).padStart(2, '0')}:${seconds.padStart(5, '0')}`
}

/** 无逐字时间轴的行统一生成均匀分布的卡拉OK时间轴。 */
function withWords(parsed: LyricLine[]): LyricLine[] {
  for (let i = 0; i < parsed.length; i++) {
    if (!parsed[i].words?.length) {
      const next = parsed[i + 1]?.time ?? parsed[i].time + 4200
      parsed[i].words = distributeWords(parsed[i], next - parsed[i].time)
    }
  }
  return parsed
}

async function loadForTrack(track: Track): Promise<void> {
  const id = track.id
  const custom = customLyrics.value[id]
  if (custom) {
    lines = withWords(parseLrc(custom).lines)
    return
  }
  if (track.origin === 'demo') {
    const builtin = demoLyrics[id]
    if (builtin) {
      lines = withWords(
        parseLrc(
          builtin.lines.map(([time, text]) => `[${formatStamp(time)}]${text}`).join('\n'),
          true
        ).lines
      )
      return
    }
  }
  if (track.lyricsPath) {
    const text = await window.shengyu.readLyrics(track.lyricsPath)
    if (text) {
      lines = withWords(parseLrc(text).lines)
      return
    }
  }
  lines = []
}

function report(positionMs: number): void {
  if (!lines.length) {
    if (lastReported !== -1) {
      lastReported = -1
      window.shengyu.reportLyricLine('', '', [], -1)
    }
    return
  }
  let index = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= positionMs) index = i
    else break
  }
  if (index === lastReported) return
  lastReported = index
  const line = index >= 0 ? lines[index] : null
  const current = line?.text ?? ''
  const next = index + 1 < lines.length ? lines[index + 1].text : ''
  // 当前行内已唱到的词下标
  let wordIndex = -1
  if (line?.words?.length) {
    const pos = positionMs - line.time
    for (let i = 0; i < line.words.length; i++) {
      if (line.words[i].offset <= pos) wordIndex = i
      else break
    }
  }
  window.shengyu.reportLyricLine(
    current,
    next,
    line?.words?.map((word) => word.text) ?? [],
    wordIndex
  )
}

/** 启动跟踪器（App 挂载时调用一次）。 */
export function startLyricTracker(): void {
  if (started) return
  started = true
  watch(
    () => player.currentTrack.value?.id,
    async (id) => {
      lines = []
      lastReported = -1
      if (id) {
        const track = player.currentTrack.value
        if (track) await loadForTrack(track)
      } else {
        window.shengyu.reportLyricLine('', '')
      }
    },
    { immediate: true }
  )
  watch(
    () => player.position.value,
    (position) => {
      // 位置每帧更新但按行变化节流上报；暂停时保留当前行
      report(position * 1000)
    }
  )
}
