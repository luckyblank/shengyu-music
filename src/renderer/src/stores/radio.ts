import { computed, ref } from 'vue'
import type { RadioChannel, RadioChannelsResult } from '@shared/ipc'
import type { Track } from '../types/music'
import { photoCover } from '../data/catalog'

/**
 * 声音频道 store：SomaFM 的 46 个公开频道。
 *
 * 与在线榜单一样，取数在主进程完成（渲染层 CSP 不放行 connect-src）。
 * 频道带**实时在线人数**与简介，「136 人正在收听」是真的。
 */

const result = ref<RadioChannelsResult | null>(null)
export const radioLoading = ref(false)
export const radioError = ref<string | null>(null)

export const radioGroups = computed(() => result.value?.groups ?? [])
export const radioChannels = computed(() => result.value?.channels ?? [])
export const radioTotalListeners = computed(() => result.value?.totalListeners ?? 0)
export const radioUpdatedAt = computed(() => result.value?.updatedAt ?? 0)

export async function loadRadioChannels(force = false): Promise<void> {
  if (!force && result.value) return
  radioLoading.value = true
  radioError.value = null
  try {
    result.value = await window.shengyu.fetchRadioChannels(force)
    console.log(
      `[radio] 频道目录加载完成：${result.value.channels.length} 个频道，` +
        `在线合计 ${result.value.totalListeners}`
    )
  } catch (error) {
    radioError.value = (error as Error).message || '电台目录加载失败'
    console.error('[radio] 频道目录加载失败', error)
  } finally {
    radioLoading.value = false
  }
}

/**
 * 频道 → 播放器曲目。
 *
 * cors 固定为 false：icecast 流带 icy 元数据，走 CORS 模式 Chromium 会报 Format error。
 * 直连播放会走 media-source 的降级路径 —— 能出声、能调速，但没有真实频谱，
 * 这是电台的既有设计，不是缺陷。
 */
export const radioChannelToTrack = (channel: RadioChannel): Track => ({
  id: channel.id,
  title: channel.title,
  artist: channel.description || 'SomaFM',
  album: channel.genre,
  duration: 0,
  cover: channel.coverUrl ? { kind: 'url', url: channel.coverUrl } : photoCover('night'),
  origin: 'radio',
  format: 'RADIO',
  url: channel.url,
  cors: false
})
