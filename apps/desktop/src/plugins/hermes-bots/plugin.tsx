import plugin from '@bot-mode/plugin'
/**
 * First-party Bot Mode. The live UI still lives in the hermes-bots desktop
 * plugin so runtime hot-reload keeps working during development. Packaged Bot
 * builds compile this wrapper into the app so a DMG never needs `git clone`
 * or “Reload desktop plugins.”
 */
import type { HermesPlugin } from '@hermes/plugin-sdk'

const bundled: HermesPlugin = {
  ...plugin,
  defaultEnabled: true,
  description: 'Bot roster, group chat, connectors, and shared computer.',
  name: plugin.name ?? 'Bots'
}

export default bundled
