<script setup lang="ts">
import SongRow from '../music/SongRow.vue'
import { playFromList } from '../../composables/useSearchDiscovery'
import * as player from '../../stores/player'
import type { Track } from '../../types/music'

/**
 * 搜索结果表格 —— 表头与数据行共用 base.css 里的 --search-cols。
 *
 * 列序取自设计稿：# 歌曲 歌手 专辑 时长 操作。列定义写在 CSS 变量里而不是
 * 两处各写一遍，否则改一次列宽就要同步改表头与 SongRow，早晚会错位。
 *
 * 表头是纯展示的 div，不是 <table>：整行本身是按钮（SongRow），
 * 真表格语义在这里只会和行内的交互控件打架。
 */

defineProps<{
  tracks: Track[]
  /** 表格下方的说明，例如「共 32 首，显示前 20 首」 */
  note?: string
}>()

const emit = defineEmits<{ menu: [track: Track, event: MouseEvent] }>()

const isCurrent = (track: Track): boolean => player.currentId.value === track.id
/** 菜单由页面持有（同一页可能有多处列表），这里只转发 */
const forwardMenu = (track: Track, event: MouseEvent): void => emit('menu', track, event)
</script>

<template>
  <div class="track-table">
    <div class="table-head">
      <span class="col-index">#</span>
      <span class="col-song">歌曲</span>
      <span class="col-artist">歌手</span>
      <span class="col-album">专辑</span>
      <span class="col-duration">时长</span>
      <span class="col-actions">操作</span>
    </div>

    <div class="rows">
      <SongRow
        v-for="(track, index) in tracks"
        :key="track.id"
        :track="track"
        :index="index + 1"
        variant="search"
        show-album
        :active="isCurrent(track)"
        @play="playFromList(tracks, index)"
        @menu="forwardMenu"
      />
    </div>

    <p v-if="!tracks.length" class="state">没有匹配的单曲，换个关键词试试。</p>
    <p v-else-if="note" class="note">{{ note }}</p>
  </div>
</template>

<style scoped>
.table-head {
  display: grid;
  gap: 0 var(--chart-col-gap);
  align-items: center;
  height: 36px;
  padding: 0 10px;
  border-bottom: 1px solid var(--divider);
  /* 列定义与 SongRow 的 search 变体同源，改一处两边一起对齐 */
  grid-template-columns: var(--search-cols);
  color: var(--text-3);
  font-size: 13px;
}
.col-index {
  grid-column: 1;
}
.col-song {
  grid-column: 2 / 4;
}
.col-artist {
  grid-column: 4;
}
.col-album {
  grid-column: 5;
}
.col-duration {
  grid-column: 6;
}
.col-actions {
  grid-column: 7 / -1;
  text-align: center;
}

.rows {
  display: flex;
  flex-direction: column;
}

.state {
  padding: 60px 0;
  color: var(--text-3);
  font-size: 15px;
  text-align: center;
}
.note {
  padding-top: 12px;
  color: var(--text-3);
  font-size: 12px;
  text-align: center;
}
</style>
