/** The bot product's right rail: the active agent's routines (cron jobs)
 *  and their editor. The Orgo Computer drawer was removed from this rail
 *  (BOT-3, per the fork charter's local-only posture) — the noVNC viewer
 *  stays in-tree, unmounted, at ./computer-viewer.tsx. */
import { useStore } from '@nanostores/react'
import { useState } from 'react'

import { $activeGatewayProfile, normalizeProfileKey } from '@/store/profile'
import type { CronJob } from '@/types/hermes'

import { RailHeader } from './rail'
import { AgentRoutines, RoutineEditor } from './routines'

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
