#!/usr/bin/env bash
# Launch Botmarchy dev without Electron-inherited env vars (bb exports
# ELECTRON_RUN_AS_NODE=1 which breaks the Electron binary). See
# docs/launch-local.md.
unset ELECTRON_RUN_AS_NODE
cd /home/ambitiousrealism/coding-projects/botmarchy
exec npm --workspace apps/desktop run dev:bot
