/** Build-time product SKU. Generic Hermes Desktop stays the default so
 *  existing packs keep working; Bot builds set `VITE_HERMES_DESKTOP_PRODUCT=bot`. */
export const BOT_PROVIDER_IDS = ['openai-codex', 'xai-oauth'] as const

export type BotProviderId = (typeof BOT_PROVIDER_IDS)[number]

export function isBotProduct(): boolean {
  return import.meta.env.VITE_HERMES_DESKTOP_PRODUCT === 'bot'
}

export function isBotProviderId(id: string): boolean {
  return (BOT_PROVIDER_IDS as readonly string[]).includes(id)
}

export function filterBotProviders<T extends { id: string }>(providers: T[]): T[] {
  if (!isBotProduct()) {
    return providers
  }

  return providers.filter(provider => isBotProviderId(provider.id))
}
