<script setup lang="ts">
import SearchSongItem from './SearchSongItem.vue'
import SectionHeading from '../music/SectionHeading.vue'
import {
  playFromList,
  recommendNote,
  recommendedTracks
} from '../../composables/useSearchDiscovery'
import * as player from '../../stores/player'

/**
 * 可能喜欢 —— 搜索页里唯一的「歌」模块，也是把「搜索工具」变成「发现入口」的那一块。
 *
 * 没有曲目可推时整块隐藏（而不是留一个空标题）：曲库为空时首屏只剩搜索历史，
 * 越空越要先给方向，不要给一块空壳。
 */

const playAll = (): void => {
  void player.playTracks(recommendedTracks.value, 'search')
}
</script>

<template>
  <section v-if="recommendedTracks.length" class="block">
    <SectionHeading
      title="可能喜欢"
      size="sm"
      :note="recommendNote"
      action="播放全部"
      @action="playAll"
    />

    <div class="rows">
      <SearchSongItem
        v-for="(track, index) in recommendedTracks"
        :key="track.id"
        :track="track"
        @play="playFromList(recommendedTracks, index)"
        @pause="player.toggle()"
      />
    </div>
  </section>
</template>

<style scoped>
.block {
  margin-bottom: 22px;
}
.rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
</style>
