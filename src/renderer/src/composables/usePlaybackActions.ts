import { photoCover } from '../data/catalog'
import * as player from '../stores/player'
import * as ui from '../stores/ui'
import { tracksOfPlaylist } from '../stores/library'
import type { CoverSpec, Playlist, QueueLabel, Track } from '../types/music'

/**
 * 跨页面复用的播放入口。
 *
 * 只在被两个以上页面用到时才提取 —— 单页专用的派生逻辑留在各自页面里，
 * 否则会得到一堆只有一行 import 的「composable」。
 */

export const playPlaylist = (playlist: Playlist): void => {
  void player.playTracks(tracksOfPlaylist(playlist), 'playlist')
}

export const playAll = (tracks: Track[], label: QueueLabel = 'library'): void => {
  void player.playTracks(tracks, label)
}

/** 打开歌单详情。状态在 ui store，侧栏与各页面共用同一条通道。 */
export const openPlaylist = (playlist: Playlist): void => {
  ui.openPlaylist(playlist.id)
}

export const openArtist = (name: string): void => {
  ui.artistPage.value = name
  ui.navigate('artist')
}

/** 歌单封面：有真实封面用真实封面，否则回落到内置变体图。 */
export const playlistCover = (playlist: Playlist): CoverSpec =>
  playlist.cover.kind === 'url' ? playlist.cover : photoCover(playlist.cover.variant)
