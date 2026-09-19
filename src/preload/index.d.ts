import { ElectronAPI } from '@electron-toolkit/preload'
import type { ShengyuApi } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    shengyu: ShengyuApi
  }
}
