# @switchboard/bot

Telegram bot package for Switchboard — the personal life-audit assistant.

## Architecture

```
src/
├── session.ts   — BotSession type, in-memory store, pure state helpers
├── formatter.ts — MarkdownV2 escaping & canned message builders
├── bot.ts       — Pure state-machine handlers (no grammy dependency)
├── handler.ts   — grammy Context wiring; registers bot commands & events
└── index.ts     — Public re-exports
```

### Design principles

| Principle | Detail |
|---|---|
| **Stateless handlers** | `handleMessage`, `handleStart` etc. receive a session, return `{ session, replies[] }`. No global side-effects. |
| **Pure core** | `bot.ts` imports only `session.ts` and `formatter.ts` — never grammy. Fully unit-testable. |
| **Thin grammy layer** | `handler.ts` owns all grammy types; it translates `Context` events to plain function calls and persists sessions. |
| **Injected generator** | `handleDeliveryCallback` accepts a `generateAudit` function so you can swap the LLM stub in tests. |

## Session phases

```
idle → intro → context → values → tensions → priorities → delivery → generating → done
                                                                                    ↓
                                                                         loops back to intro
```

## Usage

```ts
import { createBot } from "@switchboard/bot";

const bot = createBot(process.env.BOT_TOKEN!);
await bot.start();
```

### Custom audit generator

```ts
import { Bot } from "grammy";
import { registerHandlers, handleDeliveryCallback } from "@switchboard/bot";

const bot = new Bot(process.env.BOT_TOKEN!);
registerHandlers(bot);
await bot.start();
```

## MarkdownV2 escaping

All user-facing text is built with `formatter.ts` helpers that escape
Telegram's special characters: `_ * [ ] ( ) ~ \` > # + - = | { } . !`

Never pass raw user input directly to `ctx.reply` with `parse_mode: "MarkdownV2"` —
always wrap it with `escapeMarkdownV2(text)` first.

## Dependencies

- [`grammy`](https://grammy.dev) ^1.41.1 — Telegram Bot API framework  
- `@switchboard/core` workspace:* — LifeAudit generation & KB writing
