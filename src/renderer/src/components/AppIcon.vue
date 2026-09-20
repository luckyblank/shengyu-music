<script setup lang="ts">
defineProps<{ name: string; size?: number; strokeWidth?: number }>()
</script>

<template>
  <svg
    class="app-icon"
    :width="size || 20"
    :height="size || 20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth || 1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'home'">
      <path d="m3 10 9-7 9 7" />
      <path d="M5 9v11h14V9" />
      <path d="M9 20v-6h6v6" />
    </template>
    <template v-else-if="name === 'search'">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </template>
    <template v-else-if="name === 'library'">
      <path d="M4 4h4v16H4zM10 4h4v16h-4z" />
      <path d="m16 5 3-1 3 15-3 1z" />
    </template>
    <template v-else-if="name === 'heart'">
      <path
        d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"
      />
    </template>
    <template v-else-if="name === 'play'"><path d="m8 5 11 7-11 7z" /></template>
    <template v-else-if="name === 'pause'"><path d="M9 5v14M15 5v14" /></template>
    <template v-else-if="name === 'previous'"><path d="M6 5v14M18 6l-9 6 9 6z" /></template>
    <template v-else-if="name === 'next'"><path d="M18 5v14M6 6l9 6-9 6z" /></template>
    <template v-else-if="name === 'shuffle'">
      <path d="M3 7h3c4 0 5 10 9 10h6" />
      <path d="m18 14 3 3-3 3M3 17h3c1.2 0 2.1-.8 3-2M15 7h6M18 4l3 3-3 3" />
    </template>
    <template v-else-if="name === 'repeat'">
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4" />
      <path d="M21 13v2a3 3 0 0 1-3 3H3" />
    </template>
    <template v-else-if="name === 'repeat-one'">
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4" />
      <path d="M21 13v2a3 3 0 0 1-3 3H3" />
      <text x="11" y="15" font-size="7" fill="currentColor" stroke="none" text-anchor="middle">
        1
      </text>
    </template>
    <template v-else-if="name === 'volume'">
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12" />
    </template>
    <template v-else-if="name === 'volume-mute'">
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="m16 9 6 6M22 9l-6 6" />
    </template>
    <template v-else-if="name === 'queue'">
      <path d="M4 6h12M4 12h12M4 18h8" />
      <circle cx="19" cy="17" r="3" />
      <path d="M19 14v-2" />
    </template>
    <template v-else-if="name === 'more'">
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
    </template>
    <!-- 设计稿头图里的 ⋯ 点径 6.5、中心距 10.75（72px 尺寸下），比上面的 more 紧凑得多 -->
    <template v-else-if="name === 'more-tight'">
      <circle cx="8.4" cy="12" r="1.08" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.08" fill="currentColor" stroke="none" />
      <circle cx="15.6" cy="12" r="1.08" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="name === 'chevron-left'"><path d="m15 18-6-6 6-6" /></template>
    <template v-else-if="name === 'chevron-right'"><path d="m9 18 6-6-6-6" /></template>
    <template v-else-if="name === 'chevron-up'"><path d="m18 15-6-6-6 6" /></template>
    <template v-else-if="name === 'chevron-down'"><path d="m6 9 6 6 6-6" /></template>
    <template v-else-if="name === 'spark'">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <circle cx="12" cy="12" r="4" />
    </template>
    <template v-else-if="name === 'plus'"><path d="M12 5v14M5 12h14" /></template>
    <template v-else-if="name === 'arrow'"><path d="M5 12h14M14 7l5 5-5 5" /></template>
    <template v-else-if="name === 'close'"><path d="m6 6 12 12M18 6 6 18" /></template>
    <template v-else-if="name === 'clock'">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </template>
    <template v-else-if="name === 'folder'">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </template>
    <template v-else-if="name === 'file'">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </template>
    <template v-else-if="name === 'trash'">
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </template>
    <template v-else-if="name === 'edit'">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </template>
    <template v-else-if="name === 'play-next'">
      <path d="M3 8v8M8 8v8M13 5l8 7-8 7z" />
    </template>
    <template v-else-if="name === 'list-add'">
      <path d="M4 6h9M4 12h9M4 18h7" />
      <path d="M16 15v6M13 18h6" />
    </template>
    <template v-else-if="name === 'minimize'"><path d="M5 12h14" /></template>
    <template v-else-if="name === 'maximize'">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </template>
    <template v-else-if="name === 'restore'">
      <rect x="4" y="8" width="11" height="11" rx="2" />
      <path d="M9 8V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-2" />
    </template>
    <template v-else-if="name === 'settings'">
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
      />
    </template>
    <template v-else-if="name === 'sliders'">
      <path d="M4 8h10M18 8h2M4 16h4M12 16h8" />
      <circle cx="16" cy="8" r="2" />
      <circle cx="10" cy="16" r="2" />
    </template>
    <template v-else-if="name === 'moon'">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </template>
    <template v-else-if="name === 'sun'">
      <circle cx="12" cy="12" r="4" />
      <path
        d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
      />
    </template>
    <template v-else-if="name === 'radio'">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="8.5" cy="12" r="2" />
      <path d="M12 12h6M12 15h4M7 20l2-2M17 20l-2-2" />
    </template>
    <template v-else-if="name === 'folder-open'">
      <path
        d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H5.5A1.5 1.5 0 0 0 4 11.6l1.6 8.1A1.5 1.5 0 0 0 7 21H19a2 2 0 0 0 2-2V9"
      />
    </template>
    <template v-else-if="name === 'check'"><path d="m5 12 5 5L20 7" /></template>
    <template v-else-if="name === 'equalizer'">
      <path d="M5 20V10M12 20V4M19 20v-7" />
    </template>
    <template v-else-if="name === 'lyrics'">
      <path d="M4 6h16M4 12h11M4 18h8" />
      <path d="M18 15.5a2 2 0 1 0 2 2v-6a2 2 0 0 1 2-2" />
    </template>
    <template v-else-if="name === 'mini'">
      <rect x="5" y="6" width="14" height="12" rx="2" />
      <path d="M9 6v12" />
    </template>
    <template v-else-if="name === 'disc'">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.6" />
    </template>
    <template v-else-if="name === 'trophy'">
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 5H4.5A1.5 1.5 0 0 0 3 6.5C3 9 4.8 10.6 7 10.8" />
      <path d="M17 5h2.5A1.5 1.5 0 0 1 21 6.5c0 2.5-1.8 4.1-4 4.3" />
      <path d="M12 14v4M8.5 20h7" />
    </template>
    <template v-else-if="name === 'user'">
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </template>
    <template v-else-if="name === 'comment'">
      <path
        d="M20 12a7 7 0 0 1-7 7H8l-4 3v-3.6A7 7 0 0 1 4 12v-.5A7 7 0 0 1 11 5h2a7 7 0 0 1 7 7z"
      />
    </template>
    <template v-else-if="name === 'fire'">
      <path
        d="M12 3c.6 2.6-.5 4-1.8 5.3C8.9 9.6 7.5 11 7.5 13.6A4.5 4.5 0 0 0 12 18a4.5 4.5 0 0 0 4.5-4.4c0-1.4-.5-2.3-1.2-3.4-.4 1.3-1 1.8-1.6 2-.2-2.6-1-5-1.7-9.2z"
      />
    </template>
    <template v-else-if="name === 'refresh'">
      <path d="M19.6 12a7.6 7.6 0 1 1-2.2-5.4" />
      <path d="M19.2 3.6v3.6h-3.6" />
    </template>
    <template v-else-if="name === 'keyboard'">
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <path d="M6 10h.5M9.5 10h.5M13 10h.5M16.5 10h.5M6.5 14.2h11" />
    </template>
    <template v-else-if="name === 'info'">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11.2v5" />
      <path d="M12 7.6h.01" />
    </template>
    <template v-else-if="name === 'filter'">
      <path d="M4 6h16l-6.3 7.4V20l-3.4-1.8v-4.8z" />
    </template>
    <template v-else-if="name === 'trend'">
      <path d="M4 16.5 9 11l3.6 3.4L20 7" />
      <path d="M15.4 7H20v4.6" />
    </template>
    <template v-else-if="name === 'headphones'">
      <path d="M4 18.6v-5.4a8 8 0 0 1 16 0v5.4" />
      <rect x="4" y="13.2" width="3.9" height="5.4" rx="1.4" />
      <rect x="16.1" y="13.2" width="3.9" height="5.4" rx="1.4" />
    </template>
    <template v-else-if="name === 'note'">
      <path d="M9 17V6.4l9-1.7v9.5" />
      <circle cx="6.6" cy="17.4" r="2.6" />
      <circle cx="15.6" cy="14.2" r="2.6" />
    </template>
    <template v-else-if="name === 'quote'">
      <path d="M11 6.6C8.4 7.8 7 10 7 12.8V17h4.4v-4.4H8.9c0-1.9.9-3.3 2.6-4.2z" />
      <path d="M19.4 6.6C16.8 7.8 15.4 10 15.4 12.8V17H19.8v-4.4h-2.5c0-1.9.9-3.3 2.6-4.2z" />
    </template>
    <!-- 兜底：图标名写错时给出可见提示，而不是静默渲染一个空 SVG -->
    <template v-else>
      <circle cx="12" cy="12" r="9" stroke-dasharray="3 3" />
    </template>
  </svg>
</template>
