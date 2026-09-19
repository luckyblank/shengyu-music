<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import * as playerStore from '../stores/player'
import {
  addToPlaylist,
  likedIds,
  playlists,
  removeFromLibrary,
  toggleLike
} from '../stores/library'
import * as uiStore from '../stores/ui'
import type { Track } from '../types/music'

const liked = computed(() => likedIds.value)
const playlistList = computed(() => playlists.value)

export interface TrackMenuState {
  track: Track
  x: number
  y: number
}

const props = defineProps<{ state: TrackMenuState; removable?: boolean }>()
const emit = defineEmits<{ close: []; remove: [track: Track] }>()

const submenuOpen = ref(false)

const style = computed(() => {
  const width = 220
  const estimatedHeight = 300
  const x = Math.min(props.state.x, window.innerWidth - width - 16)
  const y = Math.min(props.state.y, window.innerHeight - estimatedHeight - 100)
  return { left: `${Math.max(8, x)}px`, top: `${Math.max(8, y)}px` }
})

const onGlobalDown = (event: MouseEvent): void => {
  const target = event.target as HTMLElement
  if (!target.closest('.track-menu')) emit('close')
}

const onGlobalKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => {
  document.addEventListener('mousedown', onGlobalDown)
  document.addEventListener('keydown', onGlobalKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onGlobalDown)
  document.removeEventListener('keydown', onGlobalKeydown)
})

const reveal = (): void => {
  if (props.state.track.path) void window.shengyu.revealInFolder(props.state.track.path)
  emit('close')
}

const removeLocal = (): void => {
  void removeFromLibrary(props.state.track.id)
  emit('close')
}

const playNow = (): void => {
  void playerStore.playTrack(props.state.track)
  emit('close')
}

const playAfter = (): void => {
  playerStore.playNext(props.state.track)
  emit('close')
}

const addQueue = (): void => {
  playerStore.enqueue(props.state.track)
  emit('close')
}

const likeMenu = (): void => {
  toggleLike(props.state.track.id)
  emit('close')
}

const addTo = (playlistId: string): void => {
  addToPlaylist(playlistId, props.state.track.id)
  emit('close')
}

const watchMv = (): void => {
  playerStore.playTrack(props.state.track).then(() => {
    uiStore.openMv()
  })
  emit('close')
}

const viewArtist = (): void => {
  uiStore.artistPage.value = props.state.track.artist
  uiStore.navigate('artist')
  emit('close')
}

const viewLyrics = (): void => {
  uiStore.openLyricsFor(props.state.track.id)
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="track-menu" :style="style" role="menu">
      <button role="menuitem" @click="playNow">
        <AppIcon name="play" :size="15" /><span>播放</span>
      </button>
      <button role="menuitem" @click="playAfter">
        <AppIcon name="play-next" :size="15" /><span>下一首播放</span>
      </button>
      <button role="menuitem" @click="addQueue">
        <AppIcon name="queue" :size="15" /><span>加入播放队列</span>
      </button>
      <button role="menuitem" :class="{ active: liked.has(state.track.id) }" @click="likeMenu">
        <AppIcon name="heart" :size="15" /><span>{{
          liked.has(state.track.id) ? '取消收藏' : '收藏'
        }}</span>
      </button>
      <button role="menuitem" @click="watchMv">
        <AppIcon name="play" :size="15" /><span>观看 MV</span>
      </button>
      <button role="menuitem" @click="viewArtist">
        <AppIcon name="spark" :size="15" /><span>查看歌手</span>
      </button>
      <button role="menuitem" @click="viewLyrics">
        <AppIcon name="lyrics" :size="15" /><span>查看歌词</span>
      </button>
      <div class="menu-divider"></div>
      <div class="menu-sub" @mouseenter="submenuOpen = true" @mouseleave="submenuOpen = false">
        <button role="menuitem" @click="submenuOpen = !submenuOpen">
          <AppIcon name="list-add" :size="15" /><span>添加到歌单</span
          ><AppIcon name="chevron-right" :size="13" />
        </button>
        <div v-if="submenuOpen" class="submenu">
          <button v-for="playlist in playlistList" :key="playlist.id" @click="addTo(playlist.id)">
            <span>{{ playlist.title }}</span>
            <AppIcon v-if="playlist.trackIds.includes(state.track.id)" name="check" :size="13" />
          </button>
          <p v-if="!playlistList.length" class="submenu-empty">还没有歌单，去左侧新建一个</p>
        </div>
      </div>
      <div class="menu-divider"></div>
      <button v-if="state.track.origin === 'local'" role="menuitem" @click="reveal">
        <AppIcon name="folder" :size="15" /><span>在文件夹中显示</span>
      </button>
      <button v-if="removable" role="menuitem" class="danger" @click="emit('remove', state.track)">
        <AppIcon name="trash" :size="15" /><span>从歌单移除</span>
      </button>
      <button
        v-if="state.track.origin === 'local'"
        role="menuitem"
        class="danger"
        @click="removeLocal"
      >
        <AppIcon name="trash" :size="15" /><span>从曲库移除</span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.track-menu {
  position: fixed;
  z-index: 60;
  width: 220px;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
  /* 规范：不用玻璃拟态，右键菜单用实底 */
  animation: menu-in 140ms cubic-bezier(0.22, 1, 0.36, 1);
}
@keyframes menu-in {
  from {
    opacity: 0;
    transform: translateY(-4px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
.track-menu > button,
.menu-sub > button {
  display: grid;
  grid-template-columns: 22px 1fr auto;
  gap: 8px;
  align-items: center;
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border-radius: 9px;
  color: var(--text-soft);
  background: transparent;
  font-size: 13.5px;
  text-align: left;
  transition:
    background 140ms ease,
    color 140ms ease;
}
.track-menu button:hover {
  color: var(--paper-100);
  background: var(--wash-2);
}
.track-menu button.active {
  color: var(--accent);
}
.track-menu button.danger {
  color: #c96a5f;
}
.track-menu button.danger:hover {
  color: #ff8d7d;
  background: rgba(201, 106, 95, 0.1);
}
.menu-divider {
  height: 1px;
  margin: 6px 8px;
  background: var(--hairline);
}
.menu-sub {
  position: relative;
}
.submenu {
  position: absolute;
  top: -4px;
  left: calc(100% + 6px);
  width: 190px;
  max-height: 240px;
  padding: 6px;
  overflow-y: auto;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
}
.submenu button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  color: var(--text-soft);
  background: transparent;
  font-size: 13.5px;
  text-align: left;
}
.submenu-empty {
  padding: 10px;
  color: var(--text-dim);
  font-size: 11px;
}
</style>
