/**
 * Core bot logic — pure state-machine functions.
 *
 * No global state; all session data is passed in and returned.
 * Functions here map (session, input) → (nextSession, reply[]).
 *
 * `@switchboard/core` LifeAudit integration is invoked in the
 * `generating` → `done` transition.
 */

import {
  type AuditPhase,
  type BotSession,
  advancePhase,
  recordAnswer,
} from "./session.js";
import {
  buildContextPrompt,
  buildDeliveryPrompt,
  buildDoneMessage,
  buildErrorMessage,
  buildGeneratingMessage,
  buildHelpMessage,
  buildPrioritiesPrompt,
  buildStatusMessage,
  buildTensionsPrompt,
  buildValuesPrompt,
  buildWelcomeMessage,
  deliveryKeyboard,
  type InlineKeyboard,
} from "./formatter.js";

// ---------------------------------------------------------------------------
// Reply shape returned by every handler
// ---------------------------------------------------------------------------

export interface BotReply {
  text: string;
  /** Optional inline keyboard to attach to this message */
  keyboard?: InlineKeyboard;
  /** If true, the caller should re-query the session from the store */
  parse_mode: "MarkdownV2";
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

/**
 * /start — reset to `intro` phase and send the welcome message.
 */
export function handleStart(session: BotSession): {
  session: BotSession;
  replies: BotReply[];
} {
  const next = advancePhase(session, "intro");
  return {
    session: next,
    replies: [{ text: buildWelcomeMessage(), parse_mode: "MarkdownV2" }],
  };
}

/**
 * /help — stateless, just returns help text.
 */
export function handleHelp(): BotReply[] {
  return [{ text: buildHelpMessage(), parse_mode: "MarkdownV2" }];
}

/**
 * /reset — wipe answers, return to idle, send welcome.
 */
export function handleReset(session: BotSession): {
  session: BotSession;
  replies: BotReply[];
} {
  const reset: BotSession = {
    ...session,
    phase: "idle",
    answers: {},
    promptCount: 0,
  };
  const next = advancePhase(reset, "intro");
  return {
    session: next,
    replies: [{ text: buildWelcomeMessage(), parse_mode: "MarkdownV2" }],
  };
}

/**
 * /status — report phase and answer count without mutating session.
 */
export function handleStatus(session: BotSession): BotReply[] {
  const stepsDone = Object.keys(session.answers).length;
  return [
    {
      text: buildStatusMessage(session.phase, stepsDone),
      parse_mode: "MarkdownV2",
    },
  ];
}

// ---------------------------------------------------------------------------
// Message handler — drives the audit state machine
// ---------------------------------------------------------------------------

/**
 * Handle an incoming plain-text message.
 *
 * Returns the (potentially mutated) session and one or more replies.
 * The caller is responsible for persisting the returned session via `saveSession`.
 */
export function handleMessage(
  session: BotSession,
  text: string,
): { session: BotSession; replies: BotReply[] } {
  switch (session.phase) {
    case "idle":
    case "intro": {
      // Any message kicks off the context phase
      const next = advancePhase(session, "context");
      return {
        session: next,
        replies: [{ text: buildContextPrompt(), parse_mode: "MarkdownV2" }],
      };
    }

    case "context": {
      const withAnswer = recordAnswer(session, "context", text);
      const next = advancePhase(withAnswer, "values");
      return {
        session: next,
        replies: [{ text: buildValuesPrompt(), parse_mode: "MarkdownV2" }],
      };
    }

    case "values": {
      const withAnswer = recordAnswer(session, "values", text);
      const next = advancePhase(withAnswer, "tensions");
      return {
        session: next,
        replies: [{ text: buildTensionsPrompt(), parse_mode: "MarkdownV2" }],
      };
    }

    case "tensions": {
      const withAnswer = recordAnswer(session, "tensions", text);
      const next = advancePhase(withAnswer, "priorities");
      return {
        session: next,
        replies: [{ text: buildPrioritiesPrompt(), parse_mode: "MarkdownV2" }],
      };
    }

    case "priorities": {
      const withAnswer = recordAnswer(session, "priorities", text);
      const next = advancePhase(withAnswer, "delivery");
      return {
        session: next,
        replies: [
          {
            text: buildDeliveryPrompt(),
            keyboard: deliveryKeyboard(),
            parse_mode: "MarkdownV2",
          },
        ],
      };
    }

    case "delivery": {
      // User typed instead of tapping a button — remind them to use the keyboard
      return {
        session,
        replies: [
          {
            text: buildDeliveryPrompt(),
            keyboard: deliveryKeyboard(),
            parse_mode: "MarkdownV2",
          },
        ],
      };
    }

    case "generating": {
      return {
        session,
        replies: [
          { text: buildGeneratingMessage(), parse_mode: "MarkdownV2" },
        ],
      };
    }

    case "done": {
      // Audit already delivered — offer to start a new one
      const next = advancePhase(session, "intro");
      return {
        session: next,
        replies: [{ text: buildWelcomeMessage(), parse_mode: "MarkdownV2" }],
      };
    }

    default: {
      const _exhaustive: never = session.phase;
      return {
        session,
        replies: [
          {
            text: buildErrorMessage(`Unknown phase: ${String(_exhaustive)}`),
            parse_mode: "MarkdownV2",
          },
        ],
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Callback query handler — delivery choice tapped on inline keyboard
// ---------------------------------------------------------------------------

/**
 * Delivery choices from the inline keyboard callback_data.
 */
export type DeliveryChoice = "kb" | "file" | "chat";

/**
 * Handle an inline keyboard callback query for delivery selection.
 *
 * `callbackData` is expected to be of the form `"delivery:<choice>"`.
 * Returns the next session state and replies. The caller is responsible for
 * answering the callback query via `ctx.answerCallbackQuery()`.
 */
export async function handleDeliveryCallback(
  session: BotSession,
  callbackData: string,
  generateAudit: (answers: BotSession["answers"]) => Promise<string>,
): Promise<{ session: BotSession; replies: BotReply[] }> {
  if (!callbackData.startsWith("delivery:")) {
    return {
      session,
      replies: [{ text: buildErrorMessage(), parse_mode: "MarkdownV2" }],
    };
  }

  const choice = callbackData.slice("delivery:".length) as DeliveryChoice;
  const generating = advancePhase(session, "generating");

  // Kick off generation (async — caller awaits this function)
  let auditOutput: string;
  try {
    auditOutput = await generateAudit(generating.answers);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      session: advancePhase(generating, "idle"),
      replies: [{ text: buildErrorMessage(msg), parse_mode: "MarkdownV2" }],
    };
  }

  const done = advancePhase(generating, "done");

  const deliveryReplies = buildDeliveryReplies(choice, auditOutput);
  return { session: done, replies: deliveryReplies };
}

function buildDeliveryReplies(
  choice: DeliveryChoice,
  auditOutput: string,
): BotReply[] {
  switch (choice) {
    case "kb":
      // The API layer (handler.ts) will write the file; we just surface the path
      return [
        {
          text: buildDoneMessage(
            "✅ Saved to your Knowledge Base (.switchboard/knowledge-base/).",
          ),
          parse_mode: "MarkdownV2",
        },
      ];

    case "file":
      // The API layer will send a document; we pass the raw content in text
      return [
        {
          text: buildDoneMessage(auditOutput),
          parse_mode: "MarkdownV2",
        },
      ];

    case "chat":
    default:
      return [
        {
          text: buildDoneMessage(auditOutput),
          parse_mode: "MarkdownV2",
        },
      ];
  }
}

// ---------------------------------------------------------------------------
// Audit generation stub
// ---------------------------------------------------------------------------

/**
 * Default audit generator — delegates to `@switchboard/core`
 * `LifeAuditStateMachine` + `ModelRouter`.
 *
 * This function is injected into `handleDeliveryCallback` so the bot logic
 * remains testable without a live LLM.  The production handler.ts can supply
 * a pre-configured alternative via the `generateAudit` parameter.
 *
 * Implementation note: because this package runs in a server context where
 * the bot token is provided at startup, we construct a fresh ModelRouter
 * (which will auto-detect Ollama / BYOK keys from the environment) and run
 * a one-shot session through LifeAuditStateMachine's synthesis path.
 */
export async function defaultGenerateAudit(
  answers: BotSession["answers"],
): Promise<string> {
  // Dynamic import keeps @switchboard/core optional at unit-test time.
  // The type cast keeps TypeScript happy without requiring the package to be
  // built before this package compiles.
  type CoreModule = {
    ModelRouter: new (cfg?: Record<string, unknown>) => {
      complete(req: {
        system: string;
        messages: Array<{ role: string; content: string }>;
        maxTokens: number;
        temperature: number;
      }): Promise<string>;
    };
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ModelRouter } = (await import("@switchboard/core")) as any as CoreModule;

  const router = new ModelRouter();

  const answerBlock = Object.entries(answers)
    .map(([key, val]) => `## ${key}\n${val}`)
    .join("\n\n");

  const systemPrompt = `You are a sharp, direct life coach synthesizing someone's life audit.
Write an honest, specific, useful 400–600 word assessment of where this person is and what they should focus on.
Be specific to what they told you. Identify 2–3 concrete areas to focus on. Write in flowing paragraphs.`;

  return router.complete({
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Here are the answers from a life audit:\n\n${answerBlock}\n\nWrite your assessment now.`,
      },
    ],
    maxTokens: 1024,
    temperature: 0.8,
  });
}

// ---------------------------------------------------------------------------
// Phase-to-label helper (used by formatter / status)
// ---------------------------------------------------------------------------

export function phaseLabel(phase: AuditPhase): string {
  const labels: Record<AuditPhase, string> = {
    idle: "Idle",
    intro: "Introduction",
    context: "Context collection",
    values: "Values exploration",
    tensions: "Tensions identification",
    priorities: "Priority setting",
    delivery: "Awaiting delivery choice",
    generating: "Generating audit…",
    done: "Audit delivered",
  };
  return labels[phase] ?? phase;
}
