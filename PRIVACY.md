# Hermes Bots privacy and data flow

Hermes Bots is open-source software that runs on the user's Mac and, when cloud mode is enabled, on infrastructure in the user's Orgo account. The project maintainers do not operate a Hermes Bots cloud service.

## Data on the Mac

The desktop app stores:

- product preferences and window state;
- local group definitions, pinned bots, and other presentation state;
- Orgo and Composio credentials encrypted through Electron `safeStorage`;
- local Hermes profiles, conversations, memory, skills, and files when the user chooses local mode.

The source setup script only installs project dependencies. It does not read, delete, or upload `~/.hermes`, and it does not create cloud resources or save credentials.

## Data on the Orgo computer

In cloud mode, the user's Orgo computer stores Hermes profiles, provider configuration, sessions and transcripts, memory, skills, MCP configuration, and files created by bots. Provider authorization is completed against the Hermes runtime on that computer, so provider credentials are subject to that computer's operating-system and Orgo account controls.

During setup, Hermes Bots uses Orgo's API to create, start, inspect, and configure the computer and to run the commands needed to establish the pinned Hermes environment. Deleting the desktop app does not delete the Orgo computer or its data; manage those resources through the app or the Orgo account.

## Network services

### Tailscale

Tailscale provides the private SSH path between the Mac and the Hermes gateway on the Orgo computer. Tailnet device metadata and connection activity are handled under the user's Tailscale account and Tailscale's policies. Keep tailnet ACLs limited to the users and devices that need access.

### Orgo desktop viewer

The in-app computer viewer requests a fresh VNC session from Orgo and connects through Orgo's hosted desktop WebSocket service. Viewer traffic and rotating VNC credentials therefore pass through Orgo infrastructure; they do not use the Hermes gateway's Tailscale SSH path.

### Composio

When connected apps are enabled, the desktop main process uses the user's Composio key to configure Composio Connect MCP access for Hermes profiles. Requests and data sent through those connected apps are processed by Composio and the selected app providers under their respective policies. Grant only the scopes each bot needs.

### Model providers

Prompts, conversation context, tool descriptions, and model responses are processed by the provider selected by the user, such as OpenAI or xAI. Provider retention, training, and account policies apply.

### MCP servers, skills, and plugins

MCP servers, skills, and plugins can receive conversation context, access credentials explicitly provided to them, call external services, and execute code with the permissions of the Hermes runtime. Hermes Bots marks the bundled Orgo and Composio MCP entries as untrusted, but that label is not a security boundary. Review all extensions before enabling them.

## Telemetry and issue reports

Hermes Bots does not add product analytics or a maintainer-operated telemetry service. Third-party services used by the user may maintain their own logs and usage records.

Diagnostics, screenshots, and issue reports are shared only when the user submits them. Review and redact API keys, OAuth codes, cookies, SSH material, hostnames, personal content, and other sensitive data before posting.

## Security

Bots sharing one Orgo computer are not isolated from one another. For the security and trust model, see [`SECURITY.md`](SECURITY.md). Service-specific privacy terms remain controlled by Orgo, Tailscale, Composio, the model provider, and connected app providers.
