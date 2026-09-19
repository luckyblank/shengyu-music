import type { CoverVariant, CoverSpec, Playlist, SynthRecipe, Track } from '../types/music'
import coverEmber from '../assets/covers/ember.jpg'
import coverTide from '../assets/covers/tide.jpg'
import coverMoss from '../assets/covers/moss.jpg'
import coverViolet from '../assets/covers/violet.jpg'
import coverSand from '../assets/covers/sand.jpg'
import coverNight from '../assets/covers/night.jpg'

/** 真实图片封面（随应用打包的本地照片，离线可用；生成渐变仅作最终回退）。 */
export const photoCovers: Record<CoverVariant, string> = {
  ember: coverEmber,
  tide: coverTide,
  moss: coverMoss,
  violet: coverViolet,
  sand: coverSand,
  night: coverNight
}

/** 按变体名取图片封面。 */
export const photoCover = (variant: CoverVariant): CoverSpec => ({
  kind: 'url',
  url: photoCovers[variant]
})

/**
 * 演示曲库：6 首程序化合成曲目。
 * 每首曲子的音乐性来自 SynthRecipe（调式/BPM/和弦进行/织体/打击乐密度），
 * 渲染层 audio 引擎按种子确定性合成 —— 零音频文件、零版权、可拖动可循环。
 */

const demo = (
  id: number,
  title: string,
  artist: string,
  album: string,
  duration: number,
  cover: CoverVariant,
  liked: boolean,
  synth: SynthRecipe
): Track => ({
  id: String(id),
  title,
  artist,
  album,
  duration,
  cover: photoCover(cover),
  origin: 'demo',
  liked,
  synth
})

export const demoTracks: Track[] = [
  demo(1, '夜航西飞', '林屿', '城市留声', 224, 'ember', true, {
    bpm: 74,
    root: 56, // G#m 夜调
    mode: 'pentatonic',
    progression: [
      [0, 3, 8, 7],
      [0, 3, 5, 7]
    ],
    texture: 'pad',
    drums: 0.14,
    brightness: 0.38,
    reverb: 0.9
  }),
  demo(2, '蓝色时刻', 'Northbound', 'After Five', 198, 'tide', false, {
    bpm: 96,
    root: 50, // D dorian 海岸
    mode: 'dorian',
    progression: [
      [0, 10, 5, 7],
      [0, 8, 3, 10]
    ],
    texture: 'pluck',
    drums: 0.32,
    brightness: 0.6,
    reverb: 0.66
  }),
  demo(3, '晚风来信', '岛屿邮差', '风经过的地方', 256, 'moss', true, {
    bpm: 66,
    root: 52, // E 五声 暮色
    mode: 'pentatonic',
    progression: [
      [0, 5, 9, 7],
      [0, 5, 7, 3]
    ],
    texture: 'bell',
    drums: 0.05,
    brightness: 0.52,
    reverb: 1
  }),
  demo(4, '慢速公路', '向野', '公路以北', 239, 'sand', false, {
    bpm: 104,
    root: 45, // A 多利亚 公路
    mode: 'dorian',
    progression: [
      [0, 3, 7, 10],
      [0, 7, 10, 3]
    ],
    texture: 'pluck',
    drums: 0.5,
    brightness: 0.46,
    reverb: 0.55
  }),
  demo(5, '未寄出的诗', '许冬眠', '留白', 215, 'violet', false, {
    bpm: 70,
    root: 57, // A 利底亚 留白
    mode: 'lydian',
    progression: [
      [0, 9, 7, 4],
      [0, 4, 9, 7]
    ],
    texture: 'bell',
    drums: 0.08,
    brightness: 0.72,
    reverb: 0.95
  }),
  demo(6, '灯塔失眠夜', '白昼梦游', '凌晨四点半', 274, 'night', false, {
    bpm: 60,
    root: 48, // C 五声 凌晨
    mode: 'pentatonic',
    progression: [
      [0, 3, 5, 7],
      [0, 8, 3, 7]
    ],
    texture: 'pad',
    drums: 0.02,
    brightness: 0.3,
    reverb: 1.1
  })
]

/**
 * 在线音源（联网搜索接入）：
 *  - FreePD（CC0 公有领域，可商用无需署名）经 archive.org 直链，带 CORS 头，可走真实频谱；
 *  - SoundHelix 为互联网通用演示音源（无 CORS），播放器会自动降级为直连播放。
 * 在线曲目需要联网；失败会走统一的错误 Toast，不影响本地与演示曲。
 */
export const remoteTracks: Track[] = [
  {
    id: 'r-1',
    title: 'Ambient C Motion',
    artist: 'FreePD · 公有领域',
    album: '自由之声',
    duration: 0,
    cover: photoCover('tide'),
    origin: 'remote',
    url: 'https://archive.org/download/freepd/Page2/Ambient%20C%20Motion.mp3',
    cors: true
  },
  {
    id: 'r-2',
    title: 'Chill Beat',
    artist: 'FreePD · 公有领域',
    album: '自由之声',
    duration: 0,
    cover: photoCover('moss'),
    origin: 'remote',
    url: 'https://archive.org/download/freepd/Page2/Chill%20Beat.mp3',
    cors: true
  },
  {
    id: 'r-3',
    title: 'Wonder Flow',
    artist: 'FreePD · 公有领域',
    album: '自由之声',
    duration: 0,
    cover: photoCover('violet'),
    origin: 'remote',
    url: 'https://archive.org/download/freepd/Page2/Wonder%20Flow.mp3',
    cors: true
  },
  {
    id: 'r-4',
    title: 'Action Investigation',
    artist: 'FreePD · 公有领域',
    album: '自由之声',
    duration: 0,
    cover: photoCover('ember'),
    origin: 'remote',
    url: 'https://archive.org/download/freepd/Page2/Action%20Investigation.mp3',
    cors: true
  },
  {
    id: 'r-5',
    title: 'SoundHelix Song 1',
    artist: 'SoundHelix',
    album: '演示音源',
    duration: 0,
    cover: photoCover('night'),
    origin: 'remote',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    cors: false
  },
  {
    id: 'r-6',
    title: 'SoundHelix Song 9',
    artist: 'SoundHelix',
    album: '演示音源',
    duration: 0,
    cover: photoCover('sand'),
    origin: 'remote',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3',
    cors: false
  },
  {
    id: 'r-7',
    title: "Don't Think for a Minute",
    artist: 'Oval-Teen',
    album: 'MMM014 合辑 · CC',
    duration: 0,
    cover: photoCover('ember'),
    origin: 'remote',
    url: 'https://archive.org/download/mmm014/01-Oval-Teen-DontThinkforaMinuteRadioEdit.mp3',
    cors: true
  },
  {
    id: 'r-8',
    title: '1965',
    artist: 'Miyuki Kosaka',
    album: '日语流行 · CC',
    duration: 0,
    cover: photoCover('violet'),
    origin: 'remote',
    url: 'https://archive.org/download/miyuki-jetlag/01%201965.mp3',
    cors: true
  },
  {
    id: 'r-9',
    title: '嘘と絵画',
    artist: 'Mikgazer',
    album: 'Vocaloid 合辑 · CC',
    duration: 0,
    cover: photoCover('tide'),
    origin: 'remote',
    url: 'https://archive.org/download/mikgazer-vol-1/01%20-%20%E5%98%98%E3%81%A8%E7%B5%B5%E7%94%BB.mp3',
    cors: true
  },
  {
    id: 'r-10',
    title: 'NEPTUNO',
    artist: 'NEPTUNO',
    album: '人声乐队 · CC',
    duration: 0,
    cover: photoCover('sand'),
    origin: 'remote',
    url: 'https://archive.org/download/neptuno_202107/NEPTUNO.mp3',
    cors: true
  },
  {
    id: 'r-11',
    title: 'Love Storm (Sprinkler)',
    artist: 'Nick DeCaro',
    album: '七零年代流行 · CC',
    duration: 0,
    cover: photoCover('night'),
    origin: 'remote',
    url: 'https://archive.org/download/nick-decaro-love-storm/01%20-%20Love%20Storm%20%28Sprinkler%29.mp3',
    cors: true
  }
]

/**
 * 网络电台（联网验证可用，全部为 MP3/icecast 公播流）。
 * icecast 流带 icy 元数据，CORS 模式下 Chromium 会报 Format error，
 * 故统一直连播放（自动降级路径），音量作用于元素本身。
 * 电台流无时长/进度概念，播放器对 radio 来源切换为 LIVE 模式。
 */
export const radioStations: Track[] = [
  {
    id: 'st-1',
    title: 'Groove Salad',
    artist: 'SomaFM',
    album: '氛围 · 美国',
    duration: 0,
    cover: photoCover('moss'),
    origin: 'radio',
    format: 'RADIO',
    url: 'https://ice1.somafm.com/groovesalad-256-mp3',
    cors: false
  },
  {
    id: 'st-2',
    title: 'Drone Zone',
    artist: 'SomaFM',
    album: '太空氛围 · 美国',
    duration: 0,
    cover: photoCover('night'),
    origin: 'radio',
    format: 'RADIO',
    url: 'https://ice1.somafm.com/dronezone-256-mp3',
    cors: false
  },
  {
    id: 'st-3',
    title: 'Secret Agent',
    artist: 'SomaFM',
    album: '沙发间谍 · 美国',
    duration: 0,
    cover: photoCover('ember'),
    origin: 'radio',
    format: 'RADIO',
    url: 'https://ice1.somafm.com/secretagent-128-mp3',
    cors: false
  },
  {
    id: 'st-4',
    title: 'DEF CON Radio',
    artist: 'SomaFM',
    album: '电子 · 美国',
    duration: 0,
    cover: photoCover('violet'),
    origin: 'radio',
    format: 'RADIO',
    url: 'https://ice1.somafm.com/defcon-256-mp3',
    cors: false
  },
  {
    id: 'st-5',
    title: 'Radio Paradise',
    artist: 'Radio Paradise',
    album: '主混音 · 美国',
    duration: 0,
    cover: photoCover('tide'),
    origin: 'radio',
    format: 'RADIO',
    url: 'https://stream.radioparadise.com/mp3-192',
    cors: false
  },
  {
    id: 'st-6',
    title: 'RP Rock Mix',
    artist: 'Radio Paradise',
    album: '摇滚 · 美国',
    duration: 0,
    cover: photoCover('sand'),
    origin: 'radio',
    format: 'RADIO',
    url: 'https://stream.radioparadise.com/rock-192',
    cors: false
  }
]

/** 歌单（内置推荐歌单）。 */
export const defaultPlaylists: Playlist[] = [
  {
    id: 'p-demo-1',
    title: '夜色缓缓降落',
    description: '给通勤结束后的安静片刻',
    trackIds: ['1', '2', '6'],
    cover: { kind: 'variant', variant: 'ember' },
    eyebrow: '编辑精选',
    custom: false,
    createdAt: 1720000000000
  },
  {
    id: 'p-demo-2',
    title: '沿海公路电台',
    description: '海风、落日和慢一点的节拍',
    trackIds: ['2', '4', '3'],
    cover: { kind: 'variant', variant: 'tide' },
    eyebrow: '场景歌单',
    custom: false,
    createdAt: 1720000000000
  },
  {
    id: 'p-demo-3',
    title: '把周末还给自己',
    description: '松弛但不失去明亮的律动',
    trackIds: ['3', '5', '1'],
    cover: { kind: 'variant', variant: 'moss' },
    eyebrow: '为你推荐',
    custom: false,
    createdAt: 1720000000000
  },
  {
    id: 'p-demo-4',
    title: '一封没有地址的信',
    description: '柔软人声与克制的器乐编排',
    trackIds: ['5', '6', '4'],
    cover: { kind: 'variant', variant: 'violet' },
    eyebrow: '私人漫游',
    custom: false,
    createdAt: 1720000000000
  },
  {
    id: 'p-online-1',
    title: '自由之声 · CC0 精选',
    description: '公有领域在线音源，经 archive.org 直链播放',
    trackIds: ['r-1', 'r-2', 'r-3', 'r-4'],
    cover: { kind: 'variant', variant: 'tide' },
    eyebrow: '在线音源',
    custom: false,
    createdAt: 1720000000000
  },
  {
    id: 'p-online-2',
    title: '人声流行 · CC 试听',
    description: '有人声的 CC 授权流行曲目，适合试音效与均衡器',
    trackIds: ['r-7', 'r-8', 'r-9', 'r-10', 'r-11'],
    cover: { kind: 'variant', variant: 'ember' },
    eyebrow: '人声试听',
    custom: false,
    createdAt: 1720000000000
  }
]

/** 演示曲内嵌歌词：原创短诗 + 相对时间轴（毫秒）。 */
export const demoLyrics: Record<
  string,
  { meta: Record<string, string>; lines: [number, string][] }
> = {
  '1': {
    meta: { ar: '林屿', ti: '夜航西飞', al: '城市留声' },
    lines: [
      [0, '夜航西飞 · 林屿'],
      [6800, '当城市把最后一行灯收进云里'],
      [13900, '我把影子折成纸飞机'],
      [21200, '沿着你的航线缓缓西去'],
      [28200, '窗外是墨蓝色的海面'],
      [35400, '和一块失眠的浮标'],
      [42800, '我们在各自的夜里盘旋'],
      [50200, '等待同一场黎明'],
      [57600, '晚安，未抵达的信'],
      [65200, '晚安，不会降落的人']
    ]
  },
  '2': {
    meta: { ar: 'Northbound', ti: '蓝色时刻', al: 'After Five' },
    lines: [
      [0, '蓝色时刻 · Northbound'],
      [5200, '下午五点十七分'],
      [10800, '天空开始失重'],
      [16400, '你调低音量'],
      [21800, '把海岸线按进杯底'],
      [27400, '我们沿着环海公路'],
      [33000, '追一辆橘色的卡车'],
      [38800, '电台说今晚有风'],
      [44600, '于是每个人都慢了下来'],
      [50400, '蓝，落在你的肩膀']
    ]
  },
  '3': {
    meta: { ar: '岛屿邮差', ti: '晚风来信', al: '风经过的地方' },
    lines: [
      [0, '晚风来信 · 岛屿邮差'],
      [7200, '邮差在黄昏出发'],
      [14600, '口袋里装着你的名字'],
      [22200, '他经过晒咸鱼的小巷'],
      [29800, '经过没关门的杂货铺'],
      [37400, '风把信纸吹得很轻'],
      [45200, '像一句没有说出口的话'],
      [53000, '他说收信人不必拆开'],
      [60800, '晚风会替我把信读完'],
      [68600, '此致，岛屿的南方']
    ]
  },
  '4': {
    meta: { ar: '向野', ti: '慢速公路', al: '公路以北' },
    lines: [
      [0, '慢速公路 · 向野'],
      [4600, '油箱半满，地图过期'],
      [10200, '我们开上一条慢速公路'],
      [15800, '限速牌背对着太阳'],
      [21400, '玉米地在窗外打拍子'],
      [27200, '别问目的地'],
      [33000, '去北方只是因为'],
      [38800, '北方的路比较长'],
      [44600, '可以多听几首歌'],
      [50400, '可以晚一点到家']
    ]
  },
  '5': {
    meta: { ar: '许冬眠', ti: '未寄出的诗', al: '留白' },
    lines: [
      [0, '未寄出的诗 · 许冬眠'],
      [8000, '我写过很多诗'],
      [15600, '关于你，都没有寄出'],
      [23400, '它们住在抽屉第三层'],
      [31200, '和去年秋天的车票住在一起'],
      [39000, '有些句子在夜里发光'],
      [46800, '有些已经忘了为什么写'],
      [54800, '如果你偶然读到'],
      [62600, '请把它们当作'],
      [70400, '一场很轻的雪']
    ]
  },
  '6': {
    meta: { ar: '白昼梦游', ti: '灯塔失眠夜', al: '凌晨四点半' },
    lines: [
      [0, '灯塔失眠夜 · 白昼梦游'],
      [9600, '凌晨四点半'],
      [19200, '灯塔打第四个哈欠'],
      [28600, '它守着一片不睡的海'],
      [38200, '和偶尔路过的船'],
      [47800, '风数着它的白发'],
      [57400, '潮水替它值班'],
      [66800, '天快亮的时候'],
      [76400, '它终于闭上眼'],
      [86000, '梦里是白天']
    ]
  }
}
