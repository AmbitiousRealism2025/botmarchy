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

/** Editor state (composite review P1.5): `null` used to mean BOTH
 *  "editor closed" and "create new" — the two Create controls called
 *  onEdit(null), a no-op on the closed state, so "Create Routine" was
 *  dead on arrival. Discriminated value: closed / new / edit(job). */
type EditorState = { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; job: CronJob }

export function RoutinesRailPane() {
  const activeProfile = normalizeProfileKey(useStore($activeGatewayProfile))
  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' })
  const [routinesRevision, setRoutinesRevision] = useState(0)
  const editing = editor.mode !== 'closed'

  const backToList = () => {
    // P3.4: leaving the editor (Back or Esc) always bumps the revision —
    // toggles made inside the editor must be reflected, not serve a stale
    // list when the pane re-opens.
    setRoutinesRevision(value => value + 1)
    setEditor({ mode: 'closed' })
  }

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-(--ui-editor-surface-background)">
      <div
        aria-hidden={editing}
        className={`absolute inset-0 flex min-h-0 flex-col ${editing ? 'pointer-events-none invisible' : ''}`}
      >
        <AgentRoutines
          activeProfile={activeProfile}
          key={`${activeProfile}:${routinesRevision}`}
          onEdit={job => setEditor(job ? { mode: 'edit', job } : { mode: 'new' })}
        />
      </div>

      {editing ? (
        <div
          className="absolute inset-0 flex min-h-0 flex-col"
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.preventDefault()
              backToList()
            }
          }}
        >
          <RailHeader onBack={backToList} title="Routine" />
          <RoutineEditor
            job={editor.mode === 'edit' ? editor.job : null}
            onClose={changed => {
              if (changed) {
                setRoutinesRevision(value => value + 1)
              }

              setEditor({ mode: 'closed' })
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
