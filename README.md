# Switchboard

Unified AI agent orchestration monorepo — route messages, coordinate agents, stay in control.

## Structure

```
switchboard/
├── apps/          # Runnable applications (CLI, Telegram bot, API gateway, …)
├── packages/      # Shared libraries (core types, AI client adapters, config, …)
├── turbo.json     # Turborepo task pipeline
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start dev mode (all apps/packages in watch mode)
pnpm dev
```

## Requirements

- **Node** ≥ 20
- **pnpm** ≥ 10 — install via `npm install -g pnpm`

## Tech Stack

| Concern          | Choice                                   |
|------------------|------------------------------------------|
| Monorepo         | pnpm workspaces + Turborepo v2           |
| Language         | TypeScript 5 (ES2022, Node16 modules)    |
| Module system    | ESM (`"type": "module"`, `.js` imports)  |
| AI SDKs          | `@anthropic-ai/sdk`, `openai`, `ollama`  |
| CLI framework    | `commander` + `ink` (React for terminals)|
| Telegram         | `grammy`                                 |
| HTTP             | `fastify`                                |

## `@switchboard/core`

The foundational shared library. Every app and package in the monorepo depends on it.

### Agent Orchestration Types

`@switchboard/core` exports the canonical envelope types for the multi-agent layer.
Import them with the package name — never with a relative path:

```ts
import type { AgentMessage, RoutingContext, AgentDescriptor, AgentRole } from '@switchboard/core';
```

| Type | Purpose |
|------|---------|
| `AgentRole` | `'user' \| 'assistant' \| 'system' \| 'tool'` — who authored a message |
| `AgentMessage` | Full conversation-turn envelope: `id`, `agentId`, `threadId`, `role`, `content`, `createdAt`, optional `payload` |
| `RoutingContext` | Passed into every routing decision: `threadId`, `agentId`, optional `persona`, `preferredProvider`, `modelOverride`, `metadata` |
| `AgentDescriptor` | Static agent registry entry: `id`, `name`, optional `description`, `defaultPersona`, `tools` |

**Minimal example — dispatching a turn:**

```ts
import type { AgentMessage, RoutingContext } from '@switchboard/core';
import { ModelRouter } from '@switchboard/core';

const ctx: RoutingContext = {
  threadId: 'thread-abc',
  agentId:  'life-audit-agent',
  persona:  'life-audit',
  preferredProvider: 'anthropic',
};

const msg: AgentMessage = {
  id:        crypto.randomUUID(),
  agentId:   ctx.agentId,
  threadId:  ctx.threadId,
  role:      'user',
  content:   'Start my weekly review.',
  createdAt: new Date().toISOString(),
};
```

### Other Core Exports

| Export | Description |
|--------|-------------|
| `ModelRouter` | Multi-provider AI client (Ollama / Anthropic / OpenAI) |
| `KBWriter` / `KBSynthesizer` | Knowledge-base read/write and AI synthesis |
| `LifeAuditStateMachine` | Life-audit phase state machine |
| `OTPService` | One-time-password auth |
| `scaffoldWorkspace` | First-run workspace initialisation |
| `readConfig` / `writeConfig` | Typed config file management |
| `CliBot` | Interactive terminal bot harness |

## TypeScript Convention

All relative imports **must** use the `.js` extension, even in `.ts` source files.
This is required by `"module": "Node16"` / `"moduleResolution": "Node16"`.

```ts
// ✅ correct — source file lives at ./router.ts, import uses .js
import { AgentRouter } from './router.js'

// ❌ wrong — will fail at runtime under Node16 module resolution
import { AgentRouter } from './router'
```

This applies **only to relative paths** inside a package. Cross-package imports use
the bare package name and are resolved via `exports` in `package.json`:

```ts
// ✅ correct — package import, no extension needed
import type { AgentMessage } from '@switchboard/core';

// ✅ also correct — relative import inside the same package
import { slugify } from './kb/writer.js';
```

## Workspace Commands

```bash
pnpm build          # Build all packages (topological order via Turbo)
pnpm dev            # Watch mode for all packages/apps
pnpm clean          # Remove all dist/ and .turbo/ artifacts
pnpm lint           # Lint all packages
pnpm test           # Run all tests
pnpm typecheck      # TypeScript type-check all packages
```

To run a command in a specific package:

```bash
pnpm --filter @switchboard/core build
pnpm --filter switchboard-cli dev
```

## Local Workspace State

The `.switchboard/` directory in your home folder (or project root) holds local
runtime state — agent memory, conversation logs, config overrides. It is
**git-ignored** and never committed.
