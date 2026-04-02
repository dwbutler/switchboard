/**
 * Telegram Update handler — grammy integration layer.
 *
 * This file is the only place that touches grammy's `Context` type.
 * It bridges grammy's event model to the pure state-machine functions
 * in bot.ts, manages session persistence, and calls the Telegram API
 * via grammy helpers.
 */

import { Bot, type Context } from "grammy";
import {
  deleteSession,
  getOrCreateSession,
  saveSession,
} from "./session.js";
import {
  defaultGenerateAudit,
  handleDeliveryCallback,
  handleHelp,
  handleMessage,
  handleReset,
  handleStart,
  handleStatus,
} from "./bot.js";
import { buildErrorMessage } from "./formatter.js";

// ---------------------------------------------------------------------------
// Helper — send one or more replies from a BotReply array
// ---------------------------------------------------------------------------

async function sendReplies(
  ctx: Context,
  replies: Awaited<ReturnType<typeof handleMessage>>["replies"],
): Promise<void> {
  for (const reply of replies) {
    await ctx.reply(reply.text, {
      parse_mode: reply.parse_mode,
      reply_markup: reply.keyboard
        ? { inline_keyboard: reply.keyboard }
        : undefined,
    });
  }
}

// ---------------------------------------------------------------------------
// Handler registration
// ---------------------------------------------------------------------------

/**
 * Register all command and message handlers on a grammy `Bot` instance.
 *
 * Usage:
 * ```ts
 * import { Bot } from "grammy";
 * import { registerHandlers } from "@switchboard/bot";
 *
 * const bot = new Bot(process.env.BOT_TOKEN!);
 * registerHandlers(bot);
 * bot.start();
 * ```
 */
export function registerHandlers(bot: Bot): void {
  // ------------------------------------------------------------------
  // /start
  // ------------------------------------------------------------------
  bot.command("start", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;

    const session = getOrCreateSession(chatId);
    const { session: next, replies } = handleStart(session);
    saveSession(chatId, next);
    await sendReplies(ctx, replies);
  });

  // ------------------------------------------------------------------
  // /help
  // ------------------------------------------------------------------
  bot.command("help", async (ctx) => {
    await sendReplies(ctx, handleHelp());
  });

  // ------------------------------------------------------------------
  // /reset
  // ------------------------------------------------------------------
  bot.command("reset", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;

    deleteSession(chatId);
    const freshSession = getOrCreateSession(chatId);
    const { session: next, replies } = handleReset(freshSession);
    saveSession(chatId, next);
    await sendReplies(ctx, replies);
  });

  // ------------------------------------------------------------------
  // /status
  // ------------------------------------------------------------------
  bot.command("status", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;

    const session = getOrCreateSession(chatId);
    await sendReplies(ctx, handleStatus(session));
  });

  // ------------------------------------------------------------------
  // Inline keyboard callbacks
  // ------------------------------------------------------------------
  bot.on("callback_query:data", async (ctx) => {
    const chatId = ctx.chat?.id ?? ctx.callbackQuery.from.id;
    const data = ctx.callbackQuery.data;

    // Acknowledge the callback immediately so the loading spinner clears
    await ctx.answerCallbackQuery();

    if (data.startsWith("delivery:")) {
      const session = getOrCreateSession(chatId);
      const { session: next, replies } = await handleDeliveryCallback(
        session,
        data,
        defaultGenerateAudit,
      );
      saveSession(chatId, next);
      await sendReplies(ctx, replies);
    }
  });

  // ------------------------------------------------------------------
  // Plain text messages
  // ------------------------------------------------------------------
  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();

    const session = getOrCreateSession(chatId);
    const { session: next, replies } = handleMessage(session, text);
    saveSession(chatId, next);
    await sendReplies(ctx, replies);
  });

  // ------------------------------------------------------------------
  // Global error boundary
  // ------------------------------------------------------------------
  bot.catch((err) => {
    const ctx = err.ctx;
    console.error(
      `[switchboard/bot] Unhandled error for update ${ctx.update.update_id}:`,
      err.error,
    );

    const chatId = ctx.chat?.id;
    if (chatId !== undefined) {
      ctx
        .reply(buildErrorMessage(), { parse_mode: "MarkdownV2" })
        .catch(() => {
          /* swallow secondary errors */
        });
    }
  });
}

// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------

/**
 * Create and configure a ready-to-start grammy `Bot` with all handlers registered.
 *
 * @param token Telegram bot token (from BotFather)
 */
export function createBot(token: string): Bot {
  const bot = new Bot(token);
  registerHandlers(bot);
  return bot;
}
