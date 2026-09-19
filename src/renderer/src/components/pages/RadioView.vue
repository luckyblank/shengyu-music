<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import MediaCard from '../music/MediaCard.vue'
import SectionHeading from '../music/SectionHeading.vue'
import * as player from '../../stores/player'
import * as radio from '../../stores/radio'
import { formatListeners } from '../../utils/format'
import type { RadioGenreGroup } from '@shared/ipc'

/**
 * 电台 —— 声音频道，不是图片卡片墙。
 *
 * 频道数据来自 SomaFM 的公开目录，46 个频道全部带**实时在线人数**与一句简介。
 * 人数是真实量级（几十到几百），不做「12.4 万」这种美化 —— 拿不到就不编。
 * 分类直接采用 SomaFM 自己的流派归类，不另造维度。
 */

const activeGroup = ref<string>('全部')

const groups = computed<RadioGenreGroup[]>(() => radio.radioGroups.value)

const visibleGroups = computed(() =>
  activeGroup.value === '全部'
    ? groups.value
    : groups.value.filter((group) => group.name === activeGroup.value)
)

const play = (channelId: string): void => {
  const index = radio.radioChannels.value.findIndex((item) => item.id === channelId)
  if (index < 0) return
  void player.playTracks(radio.radioChannels.value.map(radio.radioChannelToTrack), 'radio', index)
}

const isCurrent = (channelId: string): boolean =>
  player.currentId.value === channelId && player.queueLabel.value === 'radio'

onMounted(() => void radio.loadRadioChannels())
</script>

<template>
  <section class="page-view">
    <header class="page-head">
      <div>
        <h1>电台</h1>
        <p>46 路 SomaFM 公播频道，点开即听。在线人数是接口给的实时值。</p>
      </div>
      <div v-if="radio.radioTotalListeners.value" class="head-stat">
        <strong>{{ formatListeners(radio.radioTotalListeners.value) }}</strong>
        <small>全部频道在线合计</small>
      </div>
    </header>

    <div v-if="radio.radioLoading.value && !groups.length" class="state">
      <span class="spinner"></span>正在获取频道目录…
    </div>

    <div v-else-if="radio.radioError.value" class="state error">
      <p>{{ radio.radioError.value }}</p>
      <button class="btn ghost" @click="radio.loadRadioChannels(true)">重试</button>
    </div>

    <template v-else>
      <div class="chips">
        <button :class="{ active: activeGroup === '全部' }" @click="activeGroup = '全部'">
          全部 <small>{{ radio.radioChannels.value.length }}</small>
        </button>
        <button
          v-for="group in groups"
          :key="group.name"
          :class="{ active: activeGroup === group.name }"
          @click="activeGroup = group.name"
        >
          {{ group.name }} <small>{{ group.channels.length }}</small>
        </button>
      </div>

      <section v-for="group in visibleGroups" :key="group.name" class="group">
        <SectionHeading :title="group.name" :note="`${group.channels.length} 个频道`" />
        <div class="grid">
          <MediaCard
            v-for="channel in group.channels"
            :key="channel.id"
            :cover="{ kind: 'url', url: channel.coverUrl }"
            :title="channel.title"
            :badge="formatListeners(channel.listeners)"
            :description="channel.description"
            :playing="isCurrent(channel.id) && player.isPlaying.value"
            @play="play(channel.id)"
            @open="play(channel.id)"
          />
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.page-head {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 24px;
}
.page-head h1 {
  color: var(--text-1);
  font-size: 40px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.page-head p {
  margin-top: 6px;
  max-width: 620px;
  color: var(--text-2);
  font-size: 15px;
}
.head-stat {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.head-stat strong {
  color: var(--brand);
  font-size: 22px;
  font-weight: 600;
}
.head-stat small {
  color: var(--text-3);
  font-size: 13px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 30px;
}
.chips button {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 6px 14px;
  border: 1px solid var(--divider);
  border-radius: var(--r-pill);
  color: var(--text-2);
  background: var(--surface);
  font-size: 14px;
  transition:
    color var(--dur-1) ease,
    border-color var(--dur-1) ease,
    background var(--dur-1) ease;
}
.chips button small {
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 12px;
}
.chips button:hover {
  color: var(--text-1);
  border-color: var(--text-3);
}
.chips button.active {
  color: var(--on-brand);
  border-color: var(--brand);
  background: var(--brand);
}
.chips button.active small {
  color: var(--on-brand);
  opacity: 0.75;
}

.group + .group {
  margin-top: 40px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: 20px;
}

.state {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: center;
  padding: 70px 0;
  color: var(--text-3);
  font-size: 15px;
}
.state.error {
  flex-direction: column;
  color: var(--text-2);
}
.btn.ghost {
  display: inline-flex;
  align-items: center;
  height: 34px;
  padding: 0 16px;
  border: 1px solid var(--divider);
  border-radius: var(--r-md);
  color: var(--text-1);
  background: var(--surface);
  font-size: 14px;
}
.btn.ghost:hover {
  background: var(--surface-soft);
}
</style>
