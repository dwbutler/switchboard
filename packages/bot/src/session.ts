/**
 * Session state for the Switchboard Telegram bot.
 *
 * Sessions are keyed by Telegram chat_id and held in memory.
 * Stateless design: the session object is passed in and out of
 * handler functions — no globals read by business logic.
 */

// ---------------------------------------------------------------------------
// Audit phases — mirrors the life-audit conversation flow
// ---------------------------------------------------------------------------

export type AuditPhase =
  | "idle"         // No active audit
  | "intro"        // Bot has greeted user, waiting for /start
  | "context"      // Gathering context: role, company, current situation
  | "values"       // Exploring core values and what matters most
  | "tensions"     // Identifying friction / pain points
  | "priorities"   // Narrowing down top priorities
  | "delivery"     // Choosing delivery format (inline KB, download, email)
  | "generating"   // Audit generation in progress
  | "done";        // Audit delivered, session closed

// ---------------------------------------------------------------------------
// Session model
// ---------------------------------------------------------------------------

export interface BotSession {
  /** Telegram user ID (same as chat_id for private chats) */
  userId: number;

  /** Current phase of the audit conversation */
  phase: AuditPhase;

  /**
   * Free-form answers keyed by question slug.
   * e.g. { context: "...", values: "...", tensions: "..." }
   */
  answers: Record<string, string>;

  /** ISO 8601 timestamp when the session was created */
  startedAt: string;

  /** ISO 8601 timestamp of the last interaction */
  lastActiveAt: string;

  /**
   * How many times the bot has prompted within the current phase
   * (used to detect stalled conversations).
   */
  promptCount: number;
}

// ---------------------------------------------------------------------------
// Session store
// ---------------------------------------------------------------------------

/** In-memory store: chat_id → session */
const store = new Map<number, BotSession>();

/**
 * Retrieve an existing session, or create a fresh one in `idle` phase.
 */
export function getOrCreateSession(chatId: number): BotSession {
  const existing = store.get(chatId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const session: BotSession = {
    userId: chatId,
    phase: "idle",
    answers: {},
    startedAt: now,
    lastActiveAt: now,
    promptCount: 0,
  };
  store.set(chatId, session);
  return session;
}

/**
 * Persist (overwrite) a session back into the store and update `lastActiveAt`.
 */
export function saveSession(chatId: number, session: BotSession): void {
  store.set(chatId, { ...session, lastActiveAt: new Date().toISOString() });
}

/**
 * Delete a session (e.g. after delivering the audit or on /reset).
 */
export function deleteSession(chatId: number): void {
  store.delete(chatId);
}

/**
 * Advance a session to the next phase and reset the prompt counter.
 * Returns the mutated (but not yet saved) session for chaining.
 */
export function advancePhase(
  session: BotSession,
  nextPhase: AuditPhase,
): BotSession {
  return { ...session, phase: nextPhase, promptCount: 0 };
}

/**
 * Record a user answer for the current phase and increment the prompt count.
 */
export function recordAnswer(
  session: BotSession,
  key: string,
  value: string,
): BotSession {
  return {
    ...session,
    answers: { ...session.answers, [key]: value },
    promptCount: session.promptCount + 1,
  };
}
