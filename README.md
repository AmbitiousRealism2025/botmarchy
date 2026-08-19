# Hermes Bots

Hermes Bots is a focused desktop app for creating persistent AI bots, giving them connected apps, and letting them share a private cloud computer.

It packages the Hermes Agent runtime behind a Bot-first interface. Your Mac runs the desktop UI; when cloud mode is enabled, bot profiles, conversations, memory, skills, and tool execution live on your Orgo computer and are reached over a private Tailscale connection.

> **Source-first preview:** Hermes Bots currently runs directly from this repository. A packaged App Store or notarized DMG is not required.

![Hermes Bots connected workspace](docs/images/onboarding/09-connected-workspace.png)

## What you can do

- Create multiple bots with separate identities and persistent conversations.
- Switch bots without losing each bot's canonical **Bot Chat**.
- Create group chats and mention bots with `@handles`.
- Connect shared apps through Composio.
- Give every bot access to one shared Orgo cloud computer.
- Watch and control that computer through the built-in desktop viewer.
- Pin frequently used bots and organize specialized bot teams.
- Keep Hermes and bot state in the cloud instead of tying it to your laptop.

## Before you start

You need:

1. A Mac running a current supported macOS release.
2. Git, Node.js 22.22 or newer, npm, and [`uv`](https://docs.astral.sh/uv/getting-started/installation/).
3. An [Orgo](https://www.orgo.ai/start) account and API key for cloud mode.
4. A free [Tailscale](https://tailscale.com/download/mac) account and the Tailscale Mac app.
5. Either:
   - a ChatGPT/Codex subscription; or
   - an xAI Grok account.
6. Optionally, a Composio Connect key for shared app integrations.

Cloud setup provisions an Orgo computer with 8 GB RAM and 4 CPU cores. This may create billable Orgo usage.

## Run Hermes Bots from GitHub

### Give the repository to a coding agent

Send your coding agent this repository URL and the prompt in [`docs/agent-assisted-setup.md`](docs/agent-assisted-setup.md). The agent will clone the repository, verify prerequisites, install from the committed lockfiles, and launch the Bot product.

### Run it yourself

```bash
git clone https://github.com/nickvasilescu/hermes-bots.git
cd hermes-bots
./scripts/setup-hermes-bots.sh --verify --run
```

Setup does not delete `~/.hermes`, create cloud resources, or save credentials. Those actions only occur after the app opens and you explicitly complete the first-run guide.

## First-run setup

The setup journey is:

**Orgo → Tailscale → Codex or Grok → First bot → Connected apps → Bot Chat**

### 1. Create your cloud computer

Paste your Orgo API key. Hermes Bots will:

- create or reuse a Hermes Bots workspace;
- create a computer from Orgo's curated Hermes Agent template;
- start the computer;
- verify Hermes is installed;
- securely configure the shared Orgo MCP integration.

Choose **Use this Mac instead** if you want a local-only setup.

![Enter an Orgo API key](docs/images/onboarding/01-cloud-computer.png)

The Orgo key is encrypted with Electron `safeStorage`. It is never returned to the renderer after being saved.

### 2. Connect privately with Tailscale

Hermes Bots uses Tailscale SSH so the Hermes gateway is not exposed to the public internet.

1. Install and open Tailscale on your Mac.
2. Sign into Tailscale.
3. Click **Authorize cloud computer**.
4. Approve the Orgo computer in the browser page that opens.
5. Wait for **This Mac** and **Cloud computer** to show connected.
6. Click **Connect Hermes**.

![Authorize the private connection](docs/images/onboarding/02-private-connection.png)

Hermes Bots then switches from its local bootstrap gateway to Hermes running on the Orgo computer. It automatically wakes that computer on future reconnects.

### 3. Choose the model provider

Choose **ChatGPT or Codex Subscription** or **xAI Grok** and complete the browser/device authorization flow.

![Choose Codex or Grok](docs/images/onboarding/03-provider.png)

Provider credentials are configured on the remote Hermes installation when cloud mode is active.

### 4. Name your first bot

Give the first bot a short descriptive name such as:

- Researcher
- Executive Assistant
- Support
- Content Planner
- Engineer

![Name the first bot](docs/images/onboarding/04-first-bot.png)

Each bot is backed by its own Hermes profile and has one persistent canonical conversation called **Bot Chat**.

### 5. Connect apps

Optionally paste a Composio Connect key. Connected tools are synchronized to every bot profile and MCP is hot-reloaded automatically.

![Connect shared apps](docs/images/onboarding/05-connect-apps.png)

You can skip this step and configure connectors later.

### 6. Open Bot Chat

Review the readiness checks and click **Open Bot Chat**.

![Finish setup](docs/images/onboarding/06-ready.png)

## Your first five-minute test

After setup:

1. Open your first bot.
2. Send: `Introduce yourself and remember that this is our first test.`
3. Send: `Use the shared computer to create /root/Desktop/hermes-bots-test.txt.`
4. Open **Computer** from the top-right controls.
5. Confirm the file appears on the Orgo desktop.
6. Create a second bot.
7. Ask the second bot to inspect the same file.
8. Switch back to the first bot and confirm its original conversation returns.
9. Quit and reopen Hermes Bots.
10. Confirm the bots, conversations, provider, and shared computer reconnect.

## Using Hermes Bots

### Bots

A bot is a Hermes profile with its own:

- identity and instructions;
- model assignment;
- memory and learned skills;
- conversation history;
- canonical Bot Chat;
- avatar and display metadata.

The normal workspace keeps the bot roster visible on the left, the active Bot Chat in the center, and the shared computer and routines on the right.

![Hermes Bots roster and workspace](docs/images/onboarding/07-bot-workspace.png)

### Group chats

Create a group, add multiple bots, and use `@bot-name` to direct a message. Group-session routing is isolated from each bot's canonical chat.

### Shared computer

All bots inherit the default Orgo computer. The built-in noVNC viewer fetches a fresh password whenever it connects because Orgo rotates VNC credentials after restarts.

### Connectors

Composio and Orgo MCP entries are synchronized whenever the bot roster changes. Creating, duplicating, or deleting a bot refreshes the MCP configuration.

### Routines

Open the computer drawer to configure scheduled agent routines. Cloud mode allows the Hermes process and its state to remain on the Orgo computer when your laptop is not hosting the runtime.

## How cloud mode works

The connection path is:

```text
Hermes Bots on your Mac
  → Tailscale SSH
  → Hermes gateway on the Orgo computer
  → bot profiles, sessions, memory, skills, and MCP tools
```

The computer viewer uses a separate path:

```text
Hermes Bots
  → Orgo API
  → rotating VNC session
  → shared Orgo desktop
```

The app never exposes the Hermes gateway directly to the public internet.

## Where data is stored

On the Mac:

- encrypted Orgo and Composio desktop credentials;
- product window and UI preferences;
- local plugin presentation state.

On the Orgo computer in cloud mode:

- Hermes profiles;
- session databases and transcripts;
- memory and skills;
- provider configuration;
- MCP configuration;
- files created on the shared desktop.

Group definitions and pinned-bot presentation state are currently local to the desktop app.

## Security model

Hermes bots can run commands, read and write files, use connected apps, and control the shared computer. Review skills, plugins, MCP servers, and approval requests before granting access.

The shared Orgo computer is single-tenant infrastructure for one owner. Bots on that computer are not isolated from each other and can potentially reach the same files and credentials. Content from the web, email, connected apps, and other external systems must be treated as untrusted input.

Keep the Hermes gateway behind Tailscale, scope third-party credentials to the minimum required permissions, and never commit credentials to this repository. See [`SECURITY.md`](SECURITY.md) for the full trust model and private vulnerability reporting.

## Troubleshooting

### This Mac does not connect in the Tailscale step

- Install the Tailscale Mac app.
- Open it and verify you are signed in.
- Confirm the menu bar icon reports **Connected**.
- Return to Hermes Bots and wait a few seconds.

### The cloud computer does not connect

- Click **Authorize cloud computer** again.
- Approve the device using the same Tailscale account as the Mac.
- Check that your tailnet policy permits Tailscale SSH for your user.
- Confirm the computer is running in the Orgo dashboard.

### Connect Hermes fails

The Mac and Orgo computer must be on the same tailnet. If your organization uses custom Tailscale access controls, permit SSH access to the Hermes Bots device as `root`.

### Provider setup does not finish

- Return to the authorization browser tab.
- Complete the Codex or Grok device flow.
- Keep Hermes Bots open until it reports success.
- Retry the provider from Settings if the device code expires.

### The shared computer is blank

- Confirm the Orgo computer is running.
- Close and reopen the Computer drawer to request a fresh VNC password.
- Use the reconnect action if Orgo recently restarted the computer.

### Reset a development installation

For an isolated clean run:

```bash
export HERMES_BOTS_E2E_DIR="/tmp/hermes-bots-e2e-$(date +%s)"
HERMES_DESKTOP_USER_DATA_DIR="$HERMES_BOTS_E2E_DIR" npm run dev:bot
```

Do not delete your normal `~/.hermes` directory to reset a test; it may contain valuable profiles and conversation history.

## Development

From `apps/desktop`:

```bash
npm run dev:bot            # Bot product in development mode
npm run test:e2e:bot       # Mocked product-shell E2E
npm run typecheck          # Renderer, Electron, and E2E type checks
```

Run the focused Orgo and remote-runtime tests:

```bash
npx vitest run \
  electron/orgo-broker.test.ts \
  electron/connection-config.test.ts \
  electron/remote-lifecycle.test.ts
```

Regenerate the onboarding screenshots:

```bash
VITE_HERMES_DESKTOP_PRODUCT=bot \
HERMES_DESKTOP_PRODUCT=bot \
npx playwright test e2e/bot-product-docs.spec.ts
```

## Updating a source checkout

```bash
git pull --ff-only
./scripts/setup-hermes-bots.sh --verify
npm --workspace apps/desktop run dev:bot
```

Hermes Bots stays on the proven single shared-Orgo architecture. The Orgo template is compatibility-pinned, and generic Hermes client/backend update prompts are disabled in the Bot product. Source users update the client and compatibility policy together by pulling a reviewed Hermes Bots commit. Cross-machine Bot Mode is intentionally deferred for the future one-computer-per-bot architecture.

See [`docs/bot-product-release-scope.md`](docs/bot-product-release-scope.md) for the compatibility policy, accepted upstream hardening, deferred work, and release gate.

## Upstream and license

Hermes Bots is built on [Hermes Agent](https://github.com/NousResearch/hermes-agent) by Nous Research.

Hermes Bots is an independent open-source project and is not endorsed by or affiliated with Nous Research or the third-party services it integrates.

The original upstream README is preserved at [`docs/upstream-hermes-agent.md`](docs/upstream-hermes-agent.md). See [`LICENSE`](LICENSE) and [`NOTICE.md`](NOTICE.md) for licensing and attribution, [`CONTRIBUTING.md`](CONTRIBUTING.md) to contribute, [`SUPPORT.md`](SUPPORT.md) for help, and [`SECURITY.md`](SECURITY.md) for private vulnerability reporting.
