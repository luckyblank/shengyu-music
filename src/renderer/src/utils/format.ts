/**
 * 展示层格式化。
 *
 * 此前 TrackList.vue / PlayerBar.vue / App.vue 各有一份私有的 formatTime，
 * 行为略有差异（有的把非法值显示为 0:00，有的显示 --:--）。这里统一。
 */

/** 秒 → `m:ss`；非法值（电台流、未探测到时长）显示 `--:--`。 */
export const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--'
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
    : `${minutes}:${String(rest).padStart(2, '0')}`
}

/** 播放量：按国内音乐客户端的读法走万/亿进制。0 或缺失返回空串，由调用方决定要不要占位。 */
export const formatPlays = (count: number): string => {
  if (!count) return ''
  if (count >= 100_000_000) return `${(count / 100_000_000).toFixed(1)}亿`
  if (count >= 10_000) return `${(count / 10_000).toFixed(1)}万`
  return String(count)
}

/** 收听人数：电台用，人数少时直接给原值，不做「万」的压缩。 */
export const formatListeners = (count: number): string =>
  count > 0 ? `${formatPlays(count) || count} 人正在收听` : '暂无在线数据'

/**
 * 计数：只要数字本身（万/亿进制压缩），0 或缺失给一个占位符。
 * 卡片角标要的是「7984」而不是「7984 人正在收听」这种整句。
 */
export const formatCount = (count: number): string => (count > 0 ? formatPlays(count) : '—')

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前 / 具体日期。 */
export const relativeTime = (at: number): string => {
  if (!at) return '—'
  const minutes = Math.floor((Date.now() - at) / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return new Date(at).toLocaleDateString('zh-CN')
}

/** 「9月19日 星期五」。用函数而非常量，避免跨天时不刷新。 */
export const todayLabel = (): string =>
  new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })

/** 按时段给出问候语。 */
export const greeting = (): string => {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

/** 本地日期 YYYY-MM-DD，用于榜单快照比对。 */
export const todayKey = (): string => new Date().toISOString().slice(0, 10)
