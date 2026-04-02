/**
 * CliBot — adapter between the terminal Chat UI and the @switchboard/core
 * LifeAuditStateMachine + ModelRouter.
 *
 * Drives the life-audit phase flow end-to-end:
 *   1. start() creates a session and returns the opening message.
 *   2. send() processes the user's answer, advances the state machine,
 *      and delivers the next question (or synthesis) via onMessage.
 *
 * After the audit is complete, send() falls through to freeform chat.
 *
 * The App component wires onMessage / onError callbacks after construction.
 */

import { ModelRouter, LifeAuditStateMachine, loadModelRouterConfig } from "@switchboard/core";
import type { ModelRouterConfig } from "@switchboard/core";

// ── Config ────────────────────────────────────────────────────────────────

export interface CliBotConfig {
  /** Explicit ModelRouter config — if omitted, loaded from ~/.switchboard/config.json */
  modelRouter?: ModelRouterConfig;
}

// ── CliBot ────────────────────────────────────────────────────────────────

export class CliBot {
  /** Called when a bot reply is ready to display */
  onMessage?: (content: string) => void;
  /** Called when a non-recoverable error occurs */
  onError?: (message: string) => void;

  private router: ModelRouter;
  private machine: LifeAuditStateMachine;
  private sessionId: string | null = null;
  private auditDone = false;

  constructor(private config: CliBotConfig = {}) {
    // Router is initialised lazily in start() so we can await loadModelRouterConfig
    // For synchronous construction, we accept an explicit config or use defaults
    this.router = new ModelRouter(config.modelRouter ?? {});
    this.machine = new LifeAuditStateMachine(this.router);
  }

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * Initialise (or re-initialise) the router from disk config if no
   * explicit config was provided, then start a new session.
   * Returns the opening greeting message.
   */
  async start(): Promise<string> {
    // Reload router config from disk if not explicitly set
    if (!this.config.modelRouter) {
      const diskConfig = await loadModelRouterConfig();
      this.router = new ModelRouter(diskConfig);
      this.machine = new LifeAuditStateMachine(this.router);
    }

    const session = this.machine.startSession("cli-user");
    this.sessionId = session.id;
    this.auditDone = false;

    return this.machine.getOpeningMessage(session.id);
  }

  /**
   * Send a user message (answer) to the audit engine.
   * Results are delivered asynchronously via onMessage / onError.
   */
  send(userInput: string): void {
    if (!this.sessionId) {
      this.onError?.("Session not started. Call start() first.");
      return;
    }
    this.processAsync(userInput).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.onError?.(msg);
    });
  }

  /**
   * Reset — clears the session so start() can begin a fresh audit.
   */
  reset(): void {
    if (this.sessionId) {
      this.machine.clearSession(this.sessionId);
    }
    this.sessionId = null;
    this.auditDone = false;
  }

  // ── Private helpers ───────────────────────────────────────────────────

  private async processAsync(userInput: string): Promise<void> {
    const sid = this.sessionId!;

    if (this.auditDone) {
      // Freeform follow-up after audit completion
      const reply = await this.freeformReply(sid, userInput);
      this.onMessage?.(reply);
      return;
    }

    const transition = await this.machine.processAnswer(sid, userInput);

    if (transition.done) {
      this.auditDone = true;
    }

    this.onMessage?.(transition.message);
  }

  /**
   * After the audit is complete, respond to freeform follow-up messages
   * with context from the completed session.
   */
  private async freeformReply(sessionId: string, userInput: string): Promise<string> {
    let context = "";
    try {
      context = this.machine.getAnswerSummary(sessionId);
    } catch {
      // session may have been cleared
    }

    const system =
      `You are a supportive life-audit assistant. The user has completed their life audit. ` +
      (context
        ? `Here is a summary of their responses:\n${context}\n\nRespond helpfully to their follow-up. `
        : "") +
      `Be direct, warm, and specific.`;

    return this.router.complete({
      system,
      messages: [{ role: "user", content: userInput }],
      maxTokens: 800,
      temperature: 0.7,
    });
  }
}
