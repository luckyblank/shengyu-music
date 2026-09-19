<script setup lang="ts">
import AppIcon from '../AppIcon.vue'
import SearchSongItem from './SearchSongItem.vue'
import SectionHeading from '../music/SectionHeading.vue'
import {
  discoverEntries,
  openPage,
  playFromList,
  recentListens
} from '../../composables/useSearchDiscovery'
import * as player from '../../stores/player'

/**
 * 有播放记录 → 最近听过；没有 → 换成「发现音乐」入口。
 *
 * 空模块是搜索页最伤人的东西：用户刚打开就被一块空白迎头拦住。
 * 所以这里的兜底不是文案，是一组真能点的去处。
 */
</script>

<template>
  <section class="block">
    <template v-if="recentListens.length">
      <SectionHeading title="最近听过" size="sm" action="全部记录" @action="openPage('recent')" />
      <div class="rows">
        <SearchSongItem
          v-for="(track, index) in recentListens"
          :key="track.id"
          :track="track"
          @play="playFromList(recentListens, index)"
          @pause="player.toggle()"
        />
      </div>
    </template>

    <template v-else>
      <SectionHeading title="发现音乐" size="sm" note="还没有播放记录" />
      <div class="entries">
        <button
          v-for="entry in discoverEntries"
          :key="entry.id"
          class="entry"
          @click="openPage(entry.page)"
        >
          <AppIcon :name="entry.icon" :size="16" />
          <span class="entry-copy">
            <strong>{{ entry.label }}</strong>
            <small>{{ entry.hint }}</small>
          </span>
          <AppIcon name="chevron-right" :size="14" />
        </button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.block {
  margin-bottom: 4px;
}
.rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.entries {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.entry {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) 14px;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-radius: var(--r-md);
  color: var(--text-2);
  background: var(--surface-soft);
  text-align: left;
  transition:
    background var(--dur-1) ease,
    color var(--dur-1) ease;
}
.entry:hover {
  color: var(--brand);
  background: var(--surface-soft-hover);
}
.entry-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}
.entry-copy strong {
  color: var(--text-1);
  font-size: 13.5px;
  font-weight: 500;
}
.entry-copy small {
  color: var(--text-3);
  font-size: 11.5px;
}
</style>
