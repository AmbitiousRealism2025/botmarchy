/**
 * Bot SKU connection chip (composite review P1.11).
 *
 * The bot product unmounts the statusbar — but its headline second mode is
 * "another computer I own over SSH," and after first-run the ONLY signal of
 * which box / whether the link is up was a notice inside the roster pane.
 * This chip renders in the real window titlebar's left slot: mode + host
 * with a live gateway-health dot, reusing the same $connection /
 * $gatewayState sources the statusbar's connectionItem used. Click →
 * Settings → Gateway.
 */
import { useStore } from '@nanostores/react'
import { useNavigate } from 'react-router'

import { SETTINGS_ROUTE } from '@/app/routes'
import { $connection, $gatewayState } from '@/store/session'
import { cn } from '@/lib/utils'

type GatewayState = ReturnType<typeof $gatewayState.get>

/** Dot colors follow the statusbar's health grammar (open = good). */
function dotClass(state: GatewayState): string {
  if (state === 'open') {
    return 'bg-emerald-400'
  }

  if (state === 'connecting') {
    return 'bg-amber-400'
  }

  if (state === 'error' || state === 'closed') {
    return 'bg-red-400'
  }

  return 'bg-(--ui-text-quaternary)'
}

export function BotConnectionChip({ className }: { className?: string }) {
  const navigate = useNavigate()
  const connection = useStore($connection)
  const gatewayState = useStore($gatewayState)

  // Local mode still gets a chip (it answers "is the link up") but names
  // itself "local" — only SSH shows a host.
  const isSsh = connection?.mode === 'remote' && connection.remoteKind === 'ssh'
  const label = isSsh ? (connection?.remoteHost || 'SSH') : 'local'

  return (
    <button
      aria-label={`Gateway: ${label} (${gatewayState}). Open connection settings.`}
      className={cn(
        'flex h-6 items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-2.5 text-[0.68rem] font-medium text-(--ui-text-secondary) transition-colors hover:bg-accent/40',
        className
      )}
      onClick={() => navigate(`${SETTINGS_ROUTE}?tab=gateway`)}
      type="button"
    >
      <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', dotClass(gatewayState))} />
      <span className="max-w-44 truncate">{label}</span>
    </button>
  )
}
