<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'
import CoverArt from '../CoverArt.vue'
import { normalizedQuery, resultTracks } from '../../composables/useSearchDiscovery'
import {
  lyricHits,
  lyricIndexRequested,
  lyricIndexing,
  lyricCoverageNote
} from '../../composables/useLyricsSearch'
import * as player from '../../stores/player'
import { formatTime } from '../../utils/format'
import type { LyricHit } from '../../composables/useLyricsSearch'

/**
 * 歌词命中 —— 结果页「歌词」分类的主体。
 *
 * 索引是惰性建的（见 useLyricsSearch），所以这里必须把「读到哪儿了」如实写在
 * 列表下方：没有覆盖度说明的话，用户会以为搜遍了全库，而实际上只有一部分
 * 曲目被索引（侧车文件读取有上限）。
 */

const hits = computed<LyricHit[]>(() => lyricHits(normalizedQuery.value))

/** 点一句歌词：整列入队并跳到这一句的秒数 —— 用户点的就是这一句 */
async function playHit(hit: LyricHit): Promise<void> {
  const seen = new Set<string>()
  // 同一首歌可能命中多行：去重后按 id 重新定位，否则点第二行会从头播第一首
  const queue = hits.value
    .map((item) => item.track)
    .filter((track) => {
      if (seen.has(track.id)) return false
      seen.add(track.id)
      return true
    })
  const list = queue.length ? queue : resultTracks.value
  await player.playTracks(
    list,
    'search',
    Math.max(
      0,
      list.findIndex((t) => t.id === hit.track.id)
    )
  )
  if (hit.time > 0) await player.seek(hit.time / 1000)
}
</script>

<template>
  <div class="lyric-hits">
    <p v-if="!lyricIndexRequested" class="state">正在准备歌词索引…</p>

    <template v-else>
      <ul v-if="hits.length" class="list">
        <li v-for="hit in hits" :key="`${hit.track.id}-${hit.time}`">
          <button class="hit" :title="`播放《${hit.track.title}》的这一句`" @click="playHit(hit)">
            <CoverArt :cover="hit.track.cover" size="tiny" />
            <span class="copy">
              <strong class="line">{{ hit.line }}</strong>
              <small>《{{ hit.track.title }}》— {{ hit.track.artist }}</small>
            </span>
            <span class="time">{{ formatTime(hit.time / 1000) }}</span>
            <AppIcon name="play" :size="14" class="go" />
          </button>
        </li>
      </ul>

      <p v-else class="state">
        没有歌词命中「{{ normalizedQuery }}」。歌词只覆盖本地曲目、内置演示曲与手动挂载的歌词，
        在线与电台曲目没有歌词数据。
      </p>

      <p v-if="lyricCoverageNote" class="coverage">
        <AppIcon v-if="lyricIndexing" name="refresh" :size="12" class="spin" />
        {{ lyricCoverageNote }}
      </p>
    </template>
  </div>
</template>

<style scoped>
.list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hit {
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
  padding: 8px 10px;
  border-radius: var(--r-sm);
  background: transparent;
  text-align: left;
  transition: background var(--dur-1) ease;
}
.hit:hover {
  background: var(--surface-hover);
}

.copy {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
}
.line {
  overflow: hidden;
  color: var(--text-1);
  font-size: 14px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.copy small {
  overflow: hidden;
  color: var(--text-3);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.time {
  flex: 0 0 auto;
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 12px;
}
.go {
  flex: 0 0 auto;
  color: var(--text-3);
  opacity: 0;
  transition: opacity var(--dur-1) ease;
}
.hit:hover .go,
.hit:focus-visible .go {
  opacity: 1;
}
@media (hover: none) {
  .go {
    opacity: 1;
  }
}

.state {
  padding: 60px 20px;
  color: var(--text-3);
  font-size: 14px;
  line-height: 1.7;
  text-align: center;
}
.coverage {
  display: flex;
  gap: 5px;
  align-items: center;
  justify-content: center;
  padding-top: 14px;
  color: var(--text-3);
  font-size: 12px;
}
.spin {
  animation: spin 1.4s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
}
</style>
