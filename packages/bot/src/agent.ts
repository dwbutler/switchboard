/**
 * BotAgent — the canonical agent implementation for @switchboard/bot.
 *
 * Implements the `run(ctx, messages)` interface defined by the
 * agent orchestration contract in @switchboard/core.  The handler
 * logic and formatter utilities in this package remain stateless;
 * BotAgent wires them together with a RoutingContext-aware session.
 */

import type { AgentMessage, RoutingContext } from '@switchboard/core';

// ── BotAgent ──────────────────────────────────────────────────────────────

/**
 * Placeholder agent implementation for the Switchboard Telegram bot.
 *
 * In production this class will:
 *  1. Look up or create a BotSession keyed on `ctx.threadId`
 *  2. Route the final user message through the audit state machine
 *  3. Produce a reply wrapped in the `AgentMessage` envelope
 *
 * For now it provides a well-typed stub that satisfies the interface so
 * downstream packages can depend on `@switchboard/bot` immediately.
 */
export class BotAgent {
  /** Stable identifier for this agent in the Switchboard registry. */
  readonly agentId: string;

  constructor(agentId = 'switchboard-bot') {
    this.agentId = agentId;
  }

  /**
   * Process an incoming message thread and return the agent's reply.
   *
   * @param ctx      - Routing context carrying thread ID, persona, provider
   *                   preferences, and optional metadata.
   * @param messages - Ordered conversation history for this thread.  The
   *                   last message with `role === 'user'` is treated as the
   *                   current turn to respond to.
   * @returns A single `AgentMessage` representing the agent's reply.
   */
  async run(
    ctx: RoutingContext,
    messages: AgentMessage[],
  ): Promise<AgentMessage> {
    // Identify the most recent user turn
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');

    // Build a reply envelope
    const reply: AgentMessage = {
      id: crypto.randomUUID(),
      agentId: this.agentId,
      threadId: ctx.threadId,
      role: 'assistant',
      content: lastUser
        ? `Echo from ${this.agentId}: ${lastUser.content}`
        : 'Hello! How can I help you today?',
      createdAt: new Date().toISOString(),
    };

    return reply;
  }
}
