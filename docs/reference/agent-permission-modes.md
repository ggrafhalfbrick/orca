# Agent permission modes

The structured chat's **Permissions** pill lets a person switch how an agent's tools are approved,
for example "ask before every action", "accept edits" or "plan only", without leaving the
conversation. It is provider-neutral: each agent names and describes its own modes, and every
client (desktop composer, mobile) renders whatever the agent reports. Claude is the first
provider; adding another is an adapter change, with no client work.

## The contract

| Piece            | Where                                                                                                           | What it carries                                                                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wire type        | `src/shared/agent-session-permission-mode.ts`                                                                   | `AgentSessionPermissionModeReport`: `{ current, modes: [{ id, label, description? }], confirmed }`                                                                                        |
| Options read     | `AgentSessionOptionsResult.permissionMode` (`agent-session-wire.ts`)                                            | Optional. Absent means no pill, so an agent that never reports one is unaffected.                                                                                                         |
| Pick             | `agentSession.setOption` with key `AGENT_SESSION_PERMISSION_MODE_KEY` (`'permissionMode'`), value = a mode `id` | The adapter's `setOption` applies it, or refuses with `AgentSessionOptionRejectedError`.                                                                                                  |
| At rest          | `StructuredAgentSessionAdapter.readRestingPermissionMode(record)`                                               | The report for a chat whose agent is not running: after an app start, a new chat, or once the agent stopped. A pick made at rest is saved to the record and the next launch starts in it. |
| Provider catalog | `src/main/native-chat/agent-session-wire/structured-agent-permission-modes.ts`                                  | `StructuredAgentPermissionMode` (a wire mode plus `needsLaunchGrant`) and `structuredAgentPermissionModeReport()`                                                                         |

Rules a report follows:

- `modes` lists only what the session can enter **now**, in menu order. A mode the agent only
  allows when the launch granted it (Claude's bypass needs Agent Permissions on Yolo) carries
  `needsLaunchGrant` in the catalog and is left out until granted. Never offer a switch the
  agent will refuse.
- `current` is the mode tools actually run under. Prefer the agent's own report over Orca's
  inference, and set `confirmed` only when the agent reported it.
- Labels and descriptions are the provider's English text, shown as sent. Clients do not
  translate per mode, because ids repeat across agents with different meanings (`auto` is not the
  same thing everywhere).
- The modes are session-wide, not per model, so they sit beside the model options rather than in
  the per-model option record.

## Adding a provider

1. **Catalog.** In the agent's own module, declare a `StructuredAgentPermissionMode[]`, or build
   one from what the agent reports at runtime (see ACP below).
2. **Report.** In the adapter's `readOptions`, add
   `permissionMode: structuredAgentPermissionModeReport(catalog, { current, launchGranted, confirmed })`.
   Track `current` from the agent's own events where it has them.
3. **Switch.** In the adapter's `setOption`, handle `AGENT_SESSION_PERMISSION_MODE_KEY`: check the
   id is enterable now, apply it through the agent's protocol, and return the session's options
   so the pick is persisted.
4. **Relaunch.** If the agent takes its mode at launch, start a session in its saved pick, the
   way `claudeStructuredSpawnOptions` does. Make sure the agent definition's
   `restingOptions.acceptsKey` admits the key, so a pick made at rest is kept.
5. **At rest.** Implement `readRestingPermissionMode(record)`: the saved pick, else the mode the
   next launch would start in, read by the same rule the launch uses.
6. **Tests.** Unit-test the catalog and the report. Add a real-CLI test that switches modes and
   reads the agent's own report of the mode back, like
   `claude-structured-real-cli-permission-mode.test.ts`.

## Provider notes

- **Claude** (implemented): `src/main/claude/claude-structured-permission-mode.ts`. Modes come
  from the Agent SDK's `PermissionMode`. The current mode is read from `system/init` and
  `system/status` frames, and switched with `set_permission_mode`. A chat starts in the
  Arguments' `--permission-mode` unless Yolo is on, and only Yolo grants bypass. A Yolo chat
  relaunched into another saved mode keeps bypass reachable through
  `--allow-dangerously-skip-permissions`, gated on CLI 2.1.143 or newer by
  `claude-allow-bypass-support.ts`.
- **ACP agents** (Gemini, Grok, Cursor and the rest; not wired yet): ACP already models this.
  `session/new` and `session/load` return `modes: { currentModeId, availableModes: [{ id, name, description }] }`,
  the agent sends `current_mode_update`, and `AcpSessionRuntime.setMode` calls
  `session/set_mode`. Map `name` to `label` and report the agent's own list; today
  `acp-session-update.ts` drops `current_mode_update`. Check per agent that its modes are about
  approvals before offering them under Permissions.
- **Codex** (not wired yet): the chat starts a thread with an `approvalPolicy` + `sandbox` pair
  from Agent Permissions (`codex-structured-permission-policy.ts`). A catalog would name presets
  over those pairs. Whether an existing thread can switch, or needs a new thread for the change to
  apply, has to be measured against app-server first.

## Not covered

Terminal (PTY) sessions keep taking permissions from the agent's CLI Arguments; the pill is a
structured-chat control.
