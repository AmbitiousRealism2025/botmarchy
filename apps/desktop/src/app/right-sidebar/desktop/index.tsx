/** The right rail's bot-product pane: the active agent's routines (cron
 *  jobs) and their editor. SKU-scoped (BOT-3 + review F1): the bot product
 *  mounts this pane; the generic Hermes SKU keeps its Orgo Computer pane,
 *  re-exported below from ./computer-viewer (close to korgo lineage). */
import { useStore } from '@nanostores/react'
import { useState } from 'react'

import { $activeGatewayProfile, normalizeProfileKey } from '@/store/profile'
import type { CronJob } from '@/types/hermes'

import { RailHeader } from './rail'
import { AgentRoutines, RoutineEditor } from './routines'

export { OrgoDesktopPane } from './computer-viewer'

export function RoutinesRailPane() {
  const activeProfile = normalizeProfileKey(useStore($activeGatewayProfile))
  const [routine, setRoutine] = useState<CronJob | null>(null)
  const [routinesRevision, setRoutinesRevision] = useState(0)
  const editing = routine !== null

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-(--ui-editor-surface-background)">
      <div
        aria-hidden={editing}
        className={`absolute inset-0 flex min-h-0 flex-col ${editing ? 'pointer-events-none invisible' : ''}`}
      >
        <AgentRoutines
          activeProfile={activeProfile}
          key={`${activeProfile}:${routinesRevision}`}
          onEdit={job => setRoutine(job)}
        />
      </div>

      {editing ? (
        <div className="absolute inset-0 flex min-h-0 flex-col">
          <RailHeader onBack={() => setRoutine(null)} title="Routine" />
          <RoutineEditor
            job={routine}
            onClose={changed => {
              if (changed) {
                setRoutinesRevision(value => value + 1)
              }

              setRoutine(null)
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
