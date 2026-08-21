/**
 * Product layout tree (extracted from contrib/controller.tsx for the
 * composite-review P2.18 rewrite): which panes each SKU opens in. Data the
 * renderer consumes — testable as behavior, not source text.
 */
import { group, split } from '@/components/pane-shell/tree/model'
import { isBotProduct } from '@/lib/product'

/** Bot products open in the messenger layout users already know from Bot
 *  Mode: a persistent roster at left, the active Bot Chat in the center,
 *  and the fixed computer/routines rail mounted by ContribController at
 *  right. */
export const BOT_TREE = split(
  'row',
  [group(['hermes-bots:pane-v2'], { id: 'grp-bots' }), group(['workspace'], { id: 'grp-main' })],
  [1, 3.4],
  'spl-root'
)

/** The tree the app boots with for the CURRENT SKU. */
export function productTreeFor<T>(defaultTree: T): T | typeof BOT_TREE {
  return isBotProduct() ? BOT_TREE : defaultTree
}
