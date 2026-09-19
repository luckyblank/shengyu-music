<script setup lang="ts">
import AppIcon from '../AppIcon.vue'
import SongList from '../music/SongList.vue'
import { playAll } from '../../composables/usePlaybackActions'
import { likedTracks } from '../../stores/library'

/** 我喜欢的音乐 —— 个人归属感最直接的入口，不只是一个列表。 */
</script>

<template>
  <section class="page-view">
    <header class="page-head">
      <div class="head-main">
        <span class="head-mark"><AppIcon name="heart" :size="22" /></span>
        <div>
          <h1>我喜欢的音乐</h1>
          <p>共 {{ likedTracks.length }} 首 · 收藏是你与音乐的私人记录</p>
        </div>
      </div>
      <button
        v-if="likedTracks.length"
        class="btn primary"
        @click="playAll(likedTracks, 'library')"
      >
        <AppIcon name="play" :size="15" />播放全部
      </button>
    </header>

    <SongList v-if="likedTracks.length" :tracks="likedTracks" show-album show-origin />

    <p v-else class="state">还没有喜欢的歌，在任意曲目上点一下心形试试。</p>
  </section>
</template>

<style scoped>
.page-head {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 28px;
}
.head-main {
  display: flex;
  gap: 16px;
  align-items: center;
}
.head-mark {
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  border-radius: var(--r-lg);
  color: var(--on-brand);
  background: var(--brand);
}
.page-head h1 {
  color: var(--text-1);
  font-size: 40px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.page-head p {
  margin-top: 4px;
  color: var(--text-2);
  font-size: 15px;
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
