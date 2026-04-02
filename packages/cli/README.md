# @switchboard/cli

Terminal interface for the **Switchboard** personal life-audit assistant.

## Commands

| Command | Description |
|---|---|
| `switchboard init` | Scaffold `~/.switchboard/` config directory |
| `switchboard personal` | Launch the interactive TUI life-audit |
| `switchboard migrate` | Migrate config / history to the latest schema |

## Architecture

```
src/
  index.ts          # bin entry — Commander root, addCommand()
  types.ts          # ChatMessage, ChatState, MessageRole
  cli-bot.ts        # CliBot adapter: LifeAudit ↔ terminal Chat
  components/
    App.tsx         # Root Ink app — manages ChatState, renders Chat
    Chat.tsx        # Scrollable history + TextInput
    Message.tsx     # Single message bubble (user / bot / system)
    Spinner.tsx     # "Thinking…" indicator (ink-spinner)
  commands/
    init.ts         # `switchboard init`
    personal.ts     # `switchboard personal`
    migrate.ts      # `switchboard migrate`
```

## Development

```bash
# From repo root (pnpm workspace)
pnpm --filter @switchboard/cli build
pnpm --filter @switchboard/cli dev    # watch mode

# Run directly during development
node packages/cli/dist/index.js personal
```

## Dependencies

- **commander** — CLI argument parsing
- **ink** + **react** — React-based terminal UI
- **ink-text-input** — TextInput component for Ink
- **ink-spinner** — Spinner animation
- **@switchboard/core** — LifeAudit state machine (workspace sibling)
