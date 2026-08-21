# Botmarchy Fork Charter

*Adopted 2026-08-20. This document defines what Botmarchy is, what it is
not, and where its boundaries sit. It is the reference for scope decisions
until superseded by a versioned revision.*

## Product definition

**Botmarchy is a local Hermes bot GUI, native to the Omarchy ecosystem.**

Your bots live on hardware you control — the machine in front of you, or a
box you own reached over SSH/Tailscale — with the model subscriptions you
already pay for. No cloud substrate, no middleman service, no metered
computer-use relay.

The core stays small: roster, conversations, memory, gateway connection.
**The product grows through plugins** (Omarchy shell plugins first, app
extensions second), not through core growth. Muster — the bar-widget roll
call — is the pattern proof: capability delivered as an Omarchy plugin,
zero core schema cost.

Tagline: **Botmarchy — the court of Omarchy.** Your machine is the
kingdom; your bots are its court.

## Fork topology

Botmarchy hard-forks from [korgo-bot](https://github.com/nickvasilescu/korgo-bot)
at commit `e2b60fb` (2026-08-19). Two distinct relationships follow:

| Lineage | Relationship | Practice |
|---|---|---|
| **korgo-bot** (Nick Vasilescu) | **Hard fork.** Product directions have diverged: korgo is an Orgo front-end; Botmarchy is local-only. | Stop tracking. Future korgo work is cherry-pick-on-demand, never automatic merge. The `korgo` remote stays for discovery. |
| **hermes-agent** (NousResearch) | **Soft tracking, optional.** The load-bearing code — SSH remote mode, gateway client, Electron shell, the Python runtime — is Nous's, inherited through korgo. | Periodically review desktop-shell/gateway fixes; merge or cherry-pick security and correctness work. The Hermes runtime on gateway boxes stays pinned to the compatibility ref; **never run generic `hermes update` against a Botmarchy install.** |

Attribution is permanent: MIT license retained, NOTICE.md credits both
lineages. This fork is independent and not endorsed by or affiliated with
Nous Research, Nick Vasilescu, or any third-party service.

## v1 posture: local only

Two connection modes, and only two:

1. **This machine** — Hermes runs locally.
2. **Another computer I own** — SSH over LAN/Tailscale, verified at
   connect (platform probe, Hermes located, compat flags), state persists
   on the remote box across client restarts.

There is no cloud mode, no hosted-computer mode, and no Orgo code path in
the product UI. The inherited Orgo machinery in main-process code stays
unmounted and unmodified — dead code is cheaper than divergent code, and
it keeps Nous-lineage merges clean. The noVNC Computer viewer stays in the
tree unmounted; it becomes relevant again only if self-hosted remote
desktop is ever wired (e.g. wayvnc).

## Design principles

1. **Workspace ≠ settings.** The main UI shows state you act on (roster,
   conversations, routines, plugins). Anything configurational lives in
   onboarding (once) or Settings (on change). No credential fields in the
   daily view; no marketing surfaces for services the user isn't using.
2. **Dark mode only, Omarchy theme-aware.** One fixed dark base palette.
   The app reads the active Omarchy theme at launch (and watches for
   changes), extracting primary/accent colors into CSS custom properties.
   Theme color is garnish — selection, focus, active markers — enough that
   every Botmarchy window obviously belongs to the desktop it runs on.
   No light mode, ever; no full theme mimicry.
3. **Plugin-first growth.** New capability must justify why it isn't an
   Omarchy plugin (Muster pattern) or a Hermes skill/MCP server before it
   may become app code.
4. **Keyboard-first.** Omarchy's grammar is the keyboard's. Every surface
   is fully operable without a mouse; mouse paths are conveniences.
5. **Own the product UI outright.** `apps/desktop` bot-product UI and
   `omarchy-integration/` are Botmarchy's to restructure freely. The
   discipline budget is spent on keeping the transport/gateway/runtime
   code close to its lineage, not on preserving korgo's screens.

## Repo posture

- **Edit surface:** `apps/desktop/src/app/bot-product/`,
  `apps/desktop/src/app/right-sidebar/`, `apps/desktop/electron/product.ts`
  (identity), `omarchy-integration/`, docs, packaging scripts.
- **Inherited, stable:** `apps/desktop/electron/` main-process transport
  (SSH, connection config, remote lifecycle), the Python runtime tree.
- **Working cadence:** feature branch `linux-port` is the living branch
  until v0.1.0, at which point it becomes `main`.

## Strategic posture — Omarchy exclusivity is a feature (2026-08-21)

Botmarchy and Muster are made for Omarchy users, full stop. We harden that
exclusivity rather than hedge it: where being Omarchy-only simplifies the
product (packaging, theming, keybind grammar, distribution), we take the
simplification and sharpen the positioning. "Made for Omarchy" is a
differentiator in itself.

Context for this decision: the Omacom Foundation launched Aug 2026 with $8M
and eight founding patrons to fund, promote, and hold the trademarks of the
Omarchy ecosystem precisely as Quattro's plugin architecture opens the
desktop to native app makers — the community plugin catalog is nascent, and
the position of flagship Omarchy-native agent product is unclaimed. After
the Muster MVP lands, a dedicated exploration (see the task board) maps
deep Omarchy integrations nobody else has shipped — candidates already
identified: the `shell` IPC target (summon/call), service-kind plugins,
plugin-to-plugin RPC, the first-party `omarchy.agents` widget surface, and
menu/overlay plugin kinds.

## Versioning

- `v0.1.0` — first release cut: fork executed, Orgo UI removed, wizard
  re-shaped, theme system in, `dist:linux` packaging, Muster installable
  via `omarchy plugin add`. The tag marks the first version that is
  Botmarchy rather than renamed korgo.

## What this charter does not decide

- Whether a hosted/multi-box topology ever returns (deferred; the
  "one-computer-per-bot" idea upstream korgo defers is explicitly not
  ours to inherit).
- Mobile clients, voice surface scope, plugin marketplace mechanics.
