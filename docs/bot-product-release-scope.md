# Hermes Bots release scope

## Current release

The first Hermes Bots release intentionally ships the proven single-computer product:

- one shared Orgo computer created from `system/hermes-agent@1.0.0`;
- Tailscale SSH between the Mac app and the remote Hermes runtime;
- multiple Hermes profiles presented as bots;
- one canonical Bot Chat per bot plus local group chats;
- shared Composio and Orgo MCP configuration;
- the persistent roster, Bot Chat, computer, and routines workspace.

The product must preserve this behavior while release hardening is in progress. New routing models are not part of this release.

## Update policy

Hermes Bots uses a compatibility-pinned release channel:

- the Orgo template reference is fixed in product code;
- generic Hermes client and remote-backend update prompts are disabled in the Bot SKU;
- updates are delivered as tested Hermes Bots DMGs with a compatible backend/template;
- an existing computer that already runs Hermes remains supported;
- the Bot SKU never installs an unpinned latest Hermes build onto a blank non-template computer.

This prevents a remote backend update from silently moving ahead of the desktop plugin and Electron connection contract.

## Accepted upstream hardening

Only isolated fixes that reproduce in the current single-Orgo architecture may be backported. The first accepted backport treats a dashboard PID that disappears during the remote ownership check as foreign instead of reporting an SSH transport failure.

## Deferred direction

Cross-machine Bot Mode from [NousResearch/hermes-agent#88664](https://github.com/NousResearch/hermes-agent/pull/88664) is deferred until after the first release. It is useful for the planned model where each bot may own a computer, but it changes bot identity and routing to `(connectionId, profileName)` and depends on the multi-connection registry.

When that work begins, it should happen on a dedicated migration branch with data-compatibility tests for existing profiles, canonical chats, groups, pins, connectors, and the shared-computer fallback.

## Release gate

A release is ready only when:

- focused Orgo, SSH lifecycle, connector, and product tests pass;
- the Bot product E2E and documentation screenshot journey pass;
- a clean Bot build succeeds;
- the macOS DMG is produced;
- signing and notarization pass in release CI;
- the previous DMG and backend snapshot remain available for rollback.
