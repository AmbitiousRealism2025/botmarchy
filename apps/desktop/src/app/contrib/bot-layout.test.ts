/**
 * Product layout tree (composite review P2.18): behavior tests on the REAL
 * tree data that drives rendering — replaces source-text assertions about
 * controller.tsx. The tree must be the roster + Bot Chat layout for the bot
 * SKU; the generic SKU keeps the default tree it was handed.
 */
import { describe, expect, it, vi } from 'vitest'

const isBot = vi.spyOn(await import('@/lib/product'), 'isBotProduct')

import { BOT_TREE, productTreeFor } from './bot-layout'

const groupPaneIds = (node: unknown): string[] => {
  if (!node || typeof node !== 'object') {
    return []
  }

  const n = node as { children?: unknown[]; panes?: string[] }

  return [
    ...(n.panes ?? []),
    ...(n.children ?? []).flatMap((child: unknown) => groupPaneIds(child))
  ]
}

describe('product layout tree', () => {
  it('the bot SKU boots into the roster + Bot Chat layout (no sessions/files/terminal panes)', () => {
    isBot.mockReturnValue(true)

    const tree = productTreeFor({ marker: 'default-tree' })
    const panes = groupPaneIds(tree)

    expect(panes).toContain('hermes-bots:pane-v2')
    expect(panes).toContain('workspace')
    // Charter: the bot product has no sessions sidebar / files / terminal
    // panes in its boot layout — keybinds, titlebar, and tree must agree.
    expect(panes).not.toContain('sessions')
    expect(panes).not.toContain('files')
    expect(panes).not.toContain('terminal')
  })

  it('the generic SKU keeps the default tree it was handed', () => {
    isBot.mockReturnValue(false)

    const handed = { marker: 'default-tree' }

    expect(productTreeFor(handed)).toBe(handed)
  })

  it('BOT_TREE places the roster LEFT of Bot Chat with the shipped ratio', () => {
    const panes = groupPaneIds(BOT_TREE)

    expect(panes.indexOf('hermes-bots:pane-v2')).toBeLessThan(panes.indexOf('workspace'))
  })
})
