import path from 'node:path'

export const HERMES_APP_NAME = 'Hermes'
export const HERMES_APP_ID = 'com.nousresearch.hermes'

export const BOT_APP_NAME = 'Hermes Bots'
export const BOT_APP_ID = 'com.nousresearch.hermes-bots'
export const BOT_USER_DATA_DIRNAME = 'Hermes Bots'
export const BOT_TEMPLATE_REF = 'system/hermes-agent@1.0.0'

export type DesktopProduct = 'bot' | 'hermes'

export function desktopProduct(): DesktopProduct {
  return process.env.HERMES_DESKTOP_PRODUCT === 'bot' ? 'bot' : 'hermes'
}

export function isBotProduct(): boolean {
  return desktopProduct() === 'bot'
}

export function desktopAppName(): string {
  return process.env.HERMES_DESKTOP_APP_NAME || (isBotProduct() ? BOT_APP_NAME : HERMES_APP_NAME)
}

export function desktopAppId(): string {
  return isBotProduct() ? BOT_APP_ID : HERMES_APP_ID
}

/** Pin the app name (and therefore the default userData folder) before any
 *  `app.getPath('userData')` call. Must run at module load. */
export function applyDesktopProductIdentity(app: {
  setName: (name: string) => void
  setPath: (name: 'userData', value: string) => void
  getPath: (name: 'userData') => string
}): void {
  if (!isBotProduct()) {
    return
  }

  app.setName(desktopAppName())

  if (process.env.HERMES_DESKTOP_USER_DATA_DIR) {
    return
  }

  const current = app.getPath('userData')
  const target = path.join(path.dirname(current), BOT_USER_DATA_DIRNAME)

  if (current !== target) {
    app.setPath('userData', target)
  }
}
