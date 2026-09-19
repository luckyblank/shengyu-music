<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'
import CoverArt from '../CoverArt.vue'
import SongList from '../music/SongList.vue'
import { playAll } from '../../composables/usePlaybackActions'
import { allTracks, recent } from '../../stores/library'
import * as ui from '../../stores/ui'

/** 歌手聚合页：从本地曲库按艺人名聚合，数据全部来自真实曲目。 */

const name = computed(() => ui.artistPage.value ?? '')

const tracks = computed(() => allTracks.value.filter((track) => track.artist === name.value))

const playCount = computed(() =>
  recent.value
    .filter((item) => tracks.value.some((track) => track.id === item.id))
    .reduce((sum, item) => sum + item.count, 0)
)

const genres = computed(() => {
  const set = new Set<string>()
  for (const track of tracks.value) if (track.genre) set.add(track.genre)
  return [...set].slice(0, 4)
})

const avatar = computed(() => tracks.value[0]?.cover)
</script>

<template>
  <section class="page-view">
    <!-- 守卫不成立时给显式空态，而不是落回别的页面 -->
    <p v-if="!name" class="state">还没有选择歌手。在曲目右键菜单里选「查看歌手」即可进入。</p>

    <template v-else>
      <header class="artist-head">
        <CoverArt :cover="avatar" size="large" class="artist-face" />
        <div class="artist-copy">
          <span class="kicker">歌手</span>
          <h1>{{ name }}</h1>
          <p>
            {{ tracks.length }} 首曲目 · 共播放 {{ playCount }} 次
            <template v-if="genres.length"> · {{ genres.join(' / ') }}</template>
          </p>
          <button class="btn primary" @click="playAll(tracks, 'library')">
            <AppIcon name="play" :size="15" />播放全部
          </button>
        </div>
      </header>

      <SongList :tracks="tracks" show-album show-origin />
    </template>
  </section>
</template>

<style scoped>
.artist-head {
  display: flex;
  gap: 24px;
  align-items: center;
  margin-bottom: 34px;
}
.artist-face {
  flex: 0 0 auto;
}
.artist-face :deep(.cover-art),
.artist-face .cover-art {
  width: 148px;
  border-radius: 50%;
}
.artist-copy h1 {
  margin-top: 2px;
  color: var(--text-1);
  font-size: 40px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.artist-copy p {
  margin: 6px 0 14px;
  color: var(--text-2);
  font-size: 15px;
}
.kicker {
  color: var(--brand);
  font-size: 13px;
  font-weight: 600;
}
.btn {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  height: 36px;
  padding: 0 18px;
  border-radius: var(--r-md);
  font-size: 14px;
}
.btn.primary {
  color: var(--on-brand);
  background: var(--brand);
}
.btn.primary:hover {
  background: var(--brand-hover);
}
.state {
  padding: 70px 0;
  color: var(--text-3);
  font-size: 15px;
  text-align: center;
}
</style>
