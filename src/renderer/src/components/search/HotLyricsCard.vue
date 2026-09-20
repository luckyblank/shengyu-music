<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import { normalizedQuery, resultTracks } from '../../composables/useSearchDiscovery'
import { cachedQuote, loadLyricQuote, lyricHits } from '../../composables/useLyricsSearch'
import * as player from '../../stores/player'
import type { LyricHit } from '../../composables/useLyricsSearch'
import type { Track } from '../../types/music'

/**
 * 热门歌词 —— 结果页右栏。
 *
 * 只引用真正命中了搜索词的歌词行（数据来自 useLyricsSearch 的惰性索引），
 * 所以卡片里出现的每一句都能在点进去的那首歌里找到。索引还没建起来时
 * 这里不显示卡片，而不是给一个「加载中」的空壳占位 —— 右栏少一格不影响阅读。
 */

const emit = defineEmits<{ more: [] }>()

const LIMIT = 5

/** 歌词分类的命中（每首最多两行），这里只取前几条做引文 */
const hits = computed<LyricHit[]>(() => lyricHits(normalizedQuery.value).slice(0, LIMIT))

/** 点一句歌词：播这首并跳到这一句；没有这首歌的曲目对象时退化成播整首 */
async function playHit(hit: LyricHit): Promise<void> {
  const index = resultTracks.value.findIndex((track) => track.id === hit.track.id)
  if (index >= 0) {
    await player.playTracks(resultTracks.value, 'search', index)
  } else {
    await player.playTrack(hit.track)
  }
  if (hit.time > 0) await player.seek(hit.time / 1000)
}

/** 没有命中时（例如只匹配到歌名）给一句不含搜索词的真实歌词，卡片依然成立 */
const fallback = ref<{ track: Track; quote: string } | null>(null)

watch(
  () => [resultTracks.value[0]?.id ?? '', normalizedQuery.value] as const,
  async ([, query]) => {
    const track = resultTracks.value[0]
    if (!track) {
      fallback.value = null
      return
    }
    await loadLyricQuote(track, query)
    const quote = cachedQuote(track.id, query)
    fallback.value = quote ? { track, quote } : null
  },
  { immediate: true }
)
</script>

<template>
  <section v-if="hits.length || fallback" class="hot-lyrics">
    <div class="head">
      <h3>热门歌词</h3>
      <button v-if="hits.length" class="more" @click="emit('more')">
        查看全部<AppIcon name="arrow" :size="12" />
      </button>
    </div>

    <ul v-if="hits.length" class="list">
      <li v-for="hit in hits" :key="`${hit.track.id}-${hit.time}`">
        <button class="hit" :title="`播放《${hit.track.title}》的这一句`" @click="playHit(hit)">
          <span class="line">{{ hit.line }}</span>
          <span class="from">《{{ hit.track.title }}》— {{ hit.track.artist }}</span>
        </button>
      </li>
    </ul>

    <button v-else-if="fallback" class="hit" @click="player.playTrack(fallback.track)">
      <span class="line">{{ fallback.quote }}</span>
      <span class="from">《{{ fallback.track.title }}》— {{ fallback.track.artist }}</span>
    </button>
  </section>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.head h3 {
  color: var(--text-1);
  font-size: 15px;
  font-weight: 600;
}
.more {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  color: var(--text-3);
  background: transparent;
  font-size: 12px;
}
.more:hover {
  color: var(--brand);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hit {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border-radius: var(--r-sm);
  background: transparent;
  text-align: left;
  transition: background var(--dur-1) ease;
}
.hit:hover {
  background: var(--surface-hover);
}
.line {
  display: -webkit-box;
  overflow: hidden;
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.hit:hover .line {
  color: var(--text-1);
}
.from {
  overflow: hidden;
  color: var(--text-3);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
