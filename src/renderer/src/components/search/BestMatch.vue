<script setup lang="ts">
import { computed, watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import CoverArt from '../CoverArt.vue'
import {
  bestMatch,
  normalizedQuery,
  openArtistPage,
  playFromList,
  resultTracks
} from '../../composables/useSearchDiscovery'
import { cachedQuote, loadLyricQuote } from '../../composables/useLyricsSearch'
import { likedIds, toggleLike } from '../../stores/library'
import * as player from '../../stores/player'
import { formatPlays, formatTime, relativeTime } from '../../utils/format'
import type { Track } from '../../types/music'

/**
 * 最佳匹配 —— 结果页左列最上面那张大卡。
 *
 * 「最佳」不是随口说的：它取的是 relevanceScore 排名第一的那首（标题全等 > 前缀 >
 * 包含 > 歌手/专辑/流派命中），排序与用户选的「最热 / 歌曲名」无关 —— 否则把排序
 * 切成最热之后，这张卡就不再是「最匹配」了。
 *
 * 徽标只用两种有真实依据的说法：榜单前十或用真实播放量判定的热歌标 HOT；
 * 十四天内加入曲库的标 NEW。没有发行日期字段，所以不装作知道「新歌」。
 */

const NEW_DAYS = 14

const track = computed<Track | null>(() => bestMatch.value)
const liked = computed(() => (track.value ? likedIds.value.has(track.value.id) : false))
const playing = computed(() => Boolean(track.value) && player.currentId.value === track.value?.id)

/** 热：榜单前十，或播放量够高的在线曲目 */
const isHot = computed(() => {
  const item = track.value
  if (!item) return false
  if (item.rank && item.rank <= 10) return true
  return (item.playCount ?? 0) >= 500_000
})

/** 新：以「加入曲库的时间」为准，而不是编一个发行日期 */
const isNew = computed(() => {
  const addedAt = track.value?.addedAt
  if (!addedAt) return false
  return Date.now() - addedAt < NEW_DAYS * 24 * 60 * 60 * 1000
})

const meta = computed(() => {
  const item = track.value
  if (!item) return ''
  return [item.artist, item.album, formatTime(item.duration)].filter(Boolean).join(' · ')
})

const stats = computed(() => {
  const item = track.value
  if (!item) return ''
  const parts: string[] = []
  if (item.playCount) parts.push(`${formatPlays(item.playCount)}次播放`)
  if (item.favoriteCount) parts.push(`${formatPlays(item.favoriteCount)}人收藏`)
  if (item.addedAt) parts.push(`加入于 ${relativeTime(item.addedAt)}`)
  return parts.join(' · ')
})

/** 引文：优先显示含搜索词的那一句歌词（搜什么就看到什么） */
const quote = computed(() =>
  track.value ? cachedQuote(track.value.id, normalizedQuery.value) : ''
)

// 换到另一首最佳匹配就去取它的歌词；读盘失败只是没有引文，界面照常工作
watch(
  track,
  (item) => {
    if (item) void loadLyricQuote(item, normalizedQuery.value)
  },
  { immediate: true }
)

const play = (): void => {
  const item = track.value
  if (!item) return
  const index = resultTracks.value.findIndex((row) => row.id === item.id)
  // 队列就是当前结果列：这样「下一首」接着的是结果里的下一首，而不是回到排行榜
  if (index >= 0) playFromList(resultTracks.value, index)
  else void player.playTrack(item)
}
</script>

<template>
  <section v-if="track" class="best">
    <div class="cover-wrap">
      <CoverArt :cover="track.cover" />
      <span v-if="isHot || isNew" class="cover-tag">{{ isHot ? 'HOT' : 'NEW' }}</span>
    </div>

    <div class="body">
      <p class="kicker">最佳匹配</p>
      <h2 :title="track.title">
        {{ track.title }}
        <span v-if="isHot" class="inline-tag hot">HOT</span>
        <span v-else-if="isNew" class="inline-tag new">NEW</span>
      </h2>
      <p class="meta">{{ meta }}</p>
      <p v-if="stats" class="stats">{{ stats }}</p>

      <blockquote v-if="quote" class="quote">
        <AppIcon name="quote" :size="14" />
        <span>{{ quote }}</span>
      </blockquote>

      <div class="actions">
        <button class="play-btn" @click="play">
          <AppIcon :name="playing && player.isPlaying.value ? 'pause' : 'play'" :size="16" />
          {{ playing && player.isPlaying.value ? '暂停' : '播放' }}
        </button>
        <button
          class="ghost-btn"
          :class="{ active: liked }"
          :title="liked ? '取消收藏' : '收藏'"
          @click="toggleLike(track.id)"
        >
          <AppIcon name="heart" :size="15" />
          {{ liked ? '已收藏' : '收藏' }}
        </button>
        <button class="ghost-btn" title="插到当前播放的下一首" @click="player.playNext(track)">
          <AppIcon name="play-next" :size="15" />
          下一首播放
        </button>
        <!-- 没有专辑页，所以这里如实写「查看歌手」并去歌手页，而不是假装能进专辑 -->
        <button v-if="track.artist" class="ghost-btn" @click="openArtistPage(track.artist)">
          <AppIcon name="user" :size="15" />
          查看歌手
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.best {
  display: flex;
  gap: 24px;
  padding: 20px;
  margin-bottom: 24px;
  border: 1px solid var(--divider);
  border-radius: var(--r-lg);
  background: var(--surface-soft);
}

.cover-wrap {
  position: relative;
  flex: 0 0 auto;
}
.cover-wrap :deep(.cover-art) {
  width: 148px;
  height: 148px;
  border-radius: var(--r-md);
}
.cover-tag {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 1px 6px;
  border-radius: var(--r-xs);
  color: var(--on-brand);
  background: var(--brand);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.04em;
}

.body {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
}
.kicker {
  color: var(--text-3);
  font-size: 12px;
  letter-spacing: 0.08em;
}
.body h2 {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 6px;
  color: var(--text-1);
  font-size: 24px;
  font-weight: 600;
}
.inline-tag {
  flex: 0 0 auto;
  padding: 1px 6px;
  border-radius: var(--r-xs);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
}
.inline-tag.hot {
  color: var(--on-brand);
  background: var(--brand);
}
.inline-tag.new {
  color: var(--brand);
  background: var(--brand-soft);
}

.meta {
  margin-top: 8px;
  color: var(--text-2);
  font-size: 14px;
}
.stats {
  margin-top: 4px;
  color: var(--text-3);
  font-size: 12px;
}

.quote {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin-top: 12px;
  padding-left: 12px;
  border-left: 2px solid var(--brand-soft);
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.6;
}
.quote :deep(.app-icon) {
  flex: 0 0 auto;
  margin-top: 3px;
  color: var(--brand);
}
/* 引文最多两行：这块卡的职责是「对上号」，不是读完整首歌词 */
.quote span {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-top: auto;
  padding-top: 18px;
}
.play-btn {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  height: 36px;
  padding: 0 22px;
  border-radius: var(--r-pill);
  color: var(--on-brand);
  background: var(--brand);
  font-size: 14px;
  transition: background var(--dur-1) ease;
}
.play-btn:hover {
  background: var(--brand-hover);
}
.ghost-btn {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  height: 36px;
  padding: 0 16px;
  border-radius: var(--r-pill);
  color: var(--text-2);
  background: transparent;
  font-size: 13px;
  transition:
    color var(--dur-1) ease,
    background var(--dur-1) ease;
}
.ghost-btn:hover {
  color: var(--text-1);
  background: var(--surface-hover);
}
.ghost-btn.active {
  color: var(--brand);
}
</style>
