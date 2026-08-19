import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const source = readFileSync('src/app/contrib/controller.tsx', 'utf8')
const splitSource = readFileSync('src/components/pane-shell/tree/renderer/tree-split.tsx', 'utf8')

describe('contribution titlebar surface', () => {
  it('keeps the workspace and right rail black while extending both pane seams to the window top', () => {
    expect(source).toContain('bg-(--ui-chat-surface-background)')
    expect(source).toContain('h-[38px]')
    expect(source).toContain('data-slot="contrib-titlebar"')
    expect(source).toContain('pointer-events-none absolute inset-y-0 z-50 w-px bg-(--ui-stroke-secondary)')
    expect(source).toContain("style={{ left: 'var(--workspace-left, 0px)' }}")
    expect(source).toContain("style={{ right: 'var(--workspace-right, 0px)' }}")
  })

  it('continues the left sidebar surface through its titlebar segment', () => {
    expect(source).toContain('bg-(--ui-sidebar-surface-background)')
    expect(source).toContain("style={{ width: 'var(--workspace-left, 0px)' }}")
  })

  it('keeps pane-track hairlines visible through each pane header', () => {
    expect(splitSource).toContain("'absolute bg-(--ui-stroke-secondary)'")
    expect(splitSource).not.toContain('bg-(--ui-stroke-secondary) opacity-10')
  })
})
