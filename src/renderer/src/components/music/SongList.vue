<script setup lang="ts">
import { ref } from 'vue'
import SongRow, { type RowTrend } from './SongRow.vue'
import TrackMenu, { type TrackMenuState } from '../TrackMenu.vue'
import * as player from '../../stores/player'
import type { Track } from '../../types/music'

/**
 * 曲目列表 = SongRow × N + 一份浮动右键菜单。
 *
 * 菜单状态是本组件内部的，页面不需要各自维护 —— 否则每个用到列表的页面
 * 都要复制一遍 openMenu/menu 这套样板。
 */

const props = withDefaults(
  defineProps<{
    tracks: Track[]
    useRank?: boolean
    showAlbum?: boolean
    showOrigin?: boolean
    showStats?: boolean
    removable?: boolean
    /** 榜单升降，key 为曲目 id */
    trends?: Record<string, RowTrend>
    /** 强制播放中的曲目 id（默认取播放器当前曲目） */
    currentId?: string | null
    /** 由父组件接管播放，而不是走默认的单曲播放 */
    manualPlay?: boolean
  }>(),
  {
    useRank: false,
    showAlbum: false,
    showOrigin: false,
    showStats: false,
    removable: false,
    trends: undefined,
    currentId: undefined,
    manualPlay: false
  }
)

const emit = defineEmits<{
  play: [track: Track]
  remove: [track: Track]
}>()

const menu = ref<TrackMenuState | null>(null)

const onPlay = (track: Track): void => {
  if (props.manualPlay) {
    emit('play', track)
    return
  }
  void player.playTrack(track)
}

const openMenu = (track: Track, event: MouseEvent): void => {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  menu.value = { track, x: rect.left, y: rect.bottom + 4 }
}

const activeId = (track: Track): boolean =>
  props.currentId === undefined ? player.currentId.value === track.id : props.currentId === track.id
</script>

<template>
  <div class="song-list">
    <SongRow
      v-for="(track, index) in tracks"
      :key="track.id"
      :track="track"
      :index="index + 1"
      :use-rank="useRank"
      :show-album="showAlbum"
      :show-origin="showOrigin"
      :show-stats="showStats"
      :active="activeId(track)"
      :trend="trends?.[track.id] ?? null"
      @play="onPlay"
      @menu="openMenu"
    />
    <TrackMenu
      v-if="menu"
      :state="menu"
      :removable="removable"
      @close="menu = null"
      @remove="emit('remove', $event)"
    />
  </div>
</template>

<style scoped>
.song-list {
  display: flex;
  flex-direction: column;
}
</style>
