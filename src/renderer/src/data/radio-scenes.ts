import type { RadioChannel } from '@shared/ipc'
import type { CoverVariant } from '../types/music'

/**
 * 电台页的编排数据：场景、节目单轮转、主播聚合。
 *
 * 这里**不存任何数字** —— 频道名、简介、分类、在线人数全部取 SomaFM 接口的实时值。
 * 只有「场景标题」「节目单怎么排」属于编辑决策，才落成常量。
 */

/** 场景电台：把「此刻在做什么」映射到真实频道，而不是凭空生成歌单。 */
export interface RadioScene {
  id: string
  title: string
  subtitle: string
  cover: CoverVariant
  /** 对应 src/main/radio.ts 里 GENRE_GROUPS 的中文组名，用来挑第一批频道 */
  group: string
  /** 补充命中词：频道 id/标题/简介/分类里出现即纳入，让场景更贴合 */
  keywords: string[]
}

/**
 * 前 6 个来自设计稿（标题与副标题逐字照搬），后 6 个按同样的句式补齐 ——
 * 「查看更多」展开的就是它们，全是真实频道，没有虚构的节目。
 */
export const RADIO_SCENES: RadioScene[] = [
  {
    id: 'commute',
    title: '通勤',
    subtitle: '让路途更有节奏',
    cover: 'ember',
    group: '电子',
    keywords: ['beat', 'blender', 'pop', 'synth']
  },
  {
    id: 'sleep',
    title: '助眠',
    subtitle: '温柔的夜间陪伴',
    cover: 'night',
    group: '氛围',
    keywords: ['drone', 'deep', 'space']
  },
  {
    id: 'cafe',
    title: '咖啡馆',
    subtitle: '慵懒的午后时光',
    cover: 'sand',
    group: '休闲',
    keywords: ['lounge', 'bossa', 'chill', 'illinois']
  },
  {
    id: 'night',
    title: '夜晚',
    subtitle: '城市的另一面',
    cover: 'violet',
    group: '氛围',
    keywords: ['dark', 'midnight', 'noir', 'secret']
  },
  {
    id: 'roam',
    title: '城市漫游',
    subtitle: '用耳朵去旅行',
    cover: 'tide',
    group: '世界',
    keywords: ['world', 'suburb', 'city', 'indie']
  },
  {
    id: 'seaside',
    title: '海边白噪音',
    subtitle: '听见潮汐的呼吸',
    cover: 'moss',
    group: '氛围',
    keywords: ['viron', 'tide', 'wave', 'space']
  },
  {
    id: 'focus',
    title: '深夜书房',
    subtitle: '低照度的专注时光',
    cover: 'night',
    group: '氛围',
    keywords: ['mission', 'control', 'drone', 'spa']
  },
  {
    id: 'morning',
    title: '周末清晨',
    subtitle: '干净的器乐与阳光',
    cover: 'sand',
    group: '民谣',
    keywords: ['folk', 'americana', 'celtic', 'twangy']
  },
  {
    id: 'party',
    title: '派对时刻',
    subtitle: '让节拍接管今晚',
    cover: 'ember',
    group: '电子',
    keywords: ['house', 'techno', 'cliqhop', 'sonic']
  },
  {
    id: 'jazzbar',
    title: '爵士小馆',
    subtitle: '烟熏味的即兴',
    cover: 'violet',
    group: '爵士',
    keywords: ['jazz', 'bossanova', 'sonic']
  },
  {
    id: 'drums',
    title: '远方的鼓点',
    subtitle: '世界音乐的呼吸',
    cover: 'tide',
    group: '世界',
    keywords: ['reggae', 'tiki', 'colombia', 'world']
  },
  {
    id: 'vinyl',
    title: '旧时光',
    subtitle: '黑胶里的年代感',
    cover: 'moss',
    group: '复古',
    keywords: ['70s', 'oldies', 'u80s', 'left']
  }
]

/** 首屏的瓦片数：设计稿是 6 列一行 */
export const PRIMARY_SCENE_COUNT = 6

/** 频道没有官方图时按序号循环取内置照片 —— 整墙共用一张默认封面看起来像加载失败。 */
const COVER_CYCLE: CoverVariant[] = ['tide', 'moss', 'violet', 'sand', 'night', 'ember']

export const cycleCover = (index: number): CoverVariant =>
  COVER_CYCLE[Math.abs(index) % COVER_CYCLE.length]

/** 把频道上能搜的文本拍平成一个串，供场景关键词命中。 */
const haystack = (channel: RadioChannel): string =>
  `${channel.id} ${channel.title} ${channel.description} ${channel.genre} ${channel.genres.join(' ')}`.toLowerCase()

/**
 * 场景 → 频道队列。
 *
 * 先取该分组下的全部频道，再用关键词补充跨组的频道，最后按**实时在线人数**降序 ——
 * 同一个人不同时刻点开同一个场景，排在最前面的可能是不同频道，这符合「电台」的语义。
 */
export function resolveSceneChannels(
  scene: RadioScene,
  channels: RadioChannel[],
  limit = 8
): RadioChannel[] {
  const byGroup = channels.filter((channel) => channel.genre === scene.group)
  const byKeyword = channels.filter(
    (channel) =>
      channel.genre !== scene.group &&
      scene.keywords.some((word) => haystack(channel).includes(word))
  )
  const merged = [...byGroup, ...byKeyword]
  // 场景一个都没命中时回落到整体最热的频道：宁可放的不是最贴题，也不要点开没反应
  const pool = merged.length ? merged : channels
  return [...pool].sort((a, b) => b.listeners - a.listeners).slice(0, limit)
}

/**
 * 设计稿里的节目标语。
 *
 * SomaFM 是 24 小时循环流，官方**没有节目表**，所以这里只保留设计稿出现过的那几条
 * （按真实频道 id 归档），其余档位一律回落到接口给的真实分类串，不编造栏目名。
 */
const SCHEDULE_TAGLINES: Record<string, string> = {
  'soma-deepspaceone': '深空漫游 · 电子氛围',
  'soma-darkzone': '深之境界 · 氛围音乐',
  'soma-dronezone': '无人之境 · 环境电波',
  'soma-synphaera': '独立厂牌精选',
  'soma-beatblender': '电子混音时刻'
}

export interface ScheduleEntry {
  /** HH:00 */
  label: string
  /** 0-23，标签已含小时，这里留给需要用它的地方 */
  hour: number
  channel: RadioChannel
  tagline: string
  /** 当前正在播出的这一档（设计稿里只有这一行右侧带「正在直播」药丸） */
  live: boolean
  /** 时间轴上「此刻」那个实心粉点所在的行（设计稿里粉点比「正在直播」低一行） */
  now: boolean
}

/** 32 位混合哈希：只为了让「同一天同一个档位」稳定落在同一个频道上。 */
function hash(value: number): number {
  let n = (value ^ 0x9e3779b9) >>> 0
  n = Math.imul(n ^ (n >>> 15), 0x85ebca6b) >>> 0
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35) >>> 0
  return (n ^ (n >>> 16)) >>> 0
}

/**
 * 今日节目单。
 *
 * 不编造节目，而是用（日期, 档位）派生的**确定性轮转**把真实频道排进「偶数小时起、两小时一档」
 * 的格子：同一天内结果固定（页面重渲染、切换分类都不会跳），跨天自动换一批。
 *
 * 时间轴上两个标记是分开的：第一行是**正在播出**的这一档（带「正在直播」药丸），
 * 实心粉点则标「此刻」落在哪条档位分界线上 —— 前半程离本档起点近，粉点与药丸同行；
 * 后半程离下一档起点近，粉点下移一行。设计稿正是这种「药丸与粉点不同行」的样子。
 */
export function buildSchedule(
  channels: RadioChannel[],
  count = 5,
  now = Date.now()
): ScheduleEntry[] {
  if (!channels.length) return []
  // 先按 id 定序：接口返回顺序变了，同一天的节目单也不该跟着变
  const pool = [...channels].sort((a, b) => a.id.localeCompare(b.id))
  const at = new Date(now)
  const day = Math.floor(
    new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime() / 86_400_000
  )
  const startHour = Math.floor(at.getHours() / 2) * 2
  // 本档已过一半（第 2 个小时，或第 1 小时的后 30 分钟）就把粉点放到下一行
  const nowRow = at.getHours() % 2 === 1 || at.getMinutes() >= 30 ? 1 : 0
  const slot = Math.floor(now / 7_200_000)
  const used = new Set<string>()
  const entries: ScheduleEntry[] = []
  for (let i = 0; i < count && used.size < pool.length; i += 1) {
    const hour = (startHour + i * 2) % 24
    let index = hash(day + slot + i) % pool.length
    // 相邻两档撞到同一个频道看起来就像 bug，往后顺延一格
    while (used.has(pool[index].id)) index = (index + 1) % pool.length
    const channel = pool[index]
    used.add(channel.id)
    entries.push({
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      channel,
      tagline:
        SCHEDULE_TAGLINES[channel.id] ||
        channel.genres.join(' · ') ||
        channel.description ||
        channel.genre,
      live: i === 0,
      now: i === nowRow
    })
  }
  return entries
}

export interface RadioHost {
  name: string
  /** 该主播名下的真实频道 */
  channels: RadioChannel[]
  /** 名下频道当前在线人数合计 */
  listeners: number
  /** 头像用其最热频道的官方图 —— SomaFM 不提供 DJ 头像，宁可用频道图也不编造图片 */
  avatar: string
}

/**
 * 热门主播：按接口真实 `dj` 聚合。
 *
 * 接口里有几个频道没有 dj 字段（空串），它们不进榜 —— 用「未知主播」凑数没有意义。
 * 已关注的排最前，关注按钮的即时反馈就是那一行会跳到最上面。
 */
export function topHosts(
  channels: RadioChannel[],
  limit = 3,
  followed: readonly string[] = []
): RadioHost[] {
  const byHost = new Map<string, RadioChannel[]>()
  for (const channel of channels) {
    const name = channel.dj.trim()
    if (!name) continue
    const list = byHost.get(name) ?? []
    list.push(channel)
    byHost.set(name, list)
  }
  const followedSet = new Set(followed)
  return [...byHost.entries()]
    .map(([name, list]) => {
      const sorted = [...list].sort((a, b) => b.listeners - a.listeners)
      return {
        name,
        channels: sorted,
        listeners: sorted.reduce((sum, channel) => sum + channel.listeners, 0),
        avatar: sorted[0]?.coverUrl ?? ''
      }
    })
    .sort(
      (a, b) =>
        Number(followedSet.has(b.name)) - Number(followedSet.has(a.name)) ||
        b.listeners - a.listeners
    )
    .slice(0, limit)
}

/**
 * 本周推荐：在线人数前 8 里按**周序号**确定性挑一个，一周内不变、下周自动换。
 *
 * exclude 用来避开已经在「正在直播」里露脸的频道，右栏不重复主栏内容。
 */
export function weeklyPick(
  channels: RadioChannel[],
  exclude: readonly string[] = [],
  now = Date.now()
): RadioChannel | null {
  const excluded = new Set(exclude)
  const pool = channels.filter((channel) => !excluded.has(channel.id))
  const list = [...(pool.length ? pool : channels)].sort((a, b) => b.listeners - a.listeners)
  const top = list.slice(0, 8)
  if (!top.length) return null
  const week = Math.floor(now / (7 * 86_400_000))
  return top[hash(week) % top.length]
}
