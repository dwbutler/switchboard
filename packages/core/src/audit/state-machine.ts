/**
 * Life Audit State Machine.
 * Drives one-question-at-a-time interviews and synthesizes final output.
 */

import { randomUUID } from 'node:crypto';
import type {
  AuditAnswer,
  AuditPhase,
  AuditSession,
  AuditTransition,
} from './types.js';
import { AUDIT_PHASES, COLLECTION_PHASES } from './phases.js';
import type { ModelRouter } from '../model/router.js';

const SYNTHESIS_SYSTEM_PROMPT = `You are a sharp, direct life coach synthesizing someone's life audit.
Your job: write an honest, specific, useful 400–600 word assessment of where this person is and what they should focus on.

Rules:
- Be specific to what they actually told you — no generic advice
- Call out both strengths and real challenges, without softening
- Identify 2–3 concrete areas to focus on, ordered by impact
- Write as if you're talking to them directly (use "you")
- Tone: clear, warm, direct — not corporate, not cheerleader, not therapist
- No bullet-point lists — flowing paragraphs only
- Do NOT start with "Great answers!" or any form of praise for their participation
- End with one specific question they should sit with this week`;

export class LifeAuditStateMachine {
  private sessions = new Map<string, AuditSession>();

  constructor(private router: ModelRouter) {}

  /** Start a new audit session for a user */
  startSession(userId: string): AuditSession {
    const session: AuditSession = {
      id: randomUUID(),
      userId,
      currentPhase: 'greeting',
      answers: [],
      startedAt: new Date().toISOString(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  /** Get the opening message for a session */
  getOpeningMessage(sessionId: string): string {
    const session = this.getSession(sessionId);
    return AUDIT_PHASES[session.currentPhase].message;
  }

  /** Get an existing session */
  getSession(sessionId: string): AuditSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`No audit session: ${sessionId}`);
    return session;
  }

  /** Check if a session exists */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /** Get current phase question */
  getCurrentQuestion(sessionId: string): string {
    const session = this.getSession(sessionId);
    const phaseConfig = AUDIT_PHASES[session.currentPhase];
    return phaseConfig.message;
  }

  /**
   * Process a user answer and advance to the next phase.
   * If the answer is very short, returns the probe question first.
   * Returns a transition describing what happens next and what to say.
   */
  async processAnswer(
    sessionId: string,
    answerText: string
  ): Promise<AuditTransition & { synthesisOutput?: string }> {
    const session = this.getSession(sessionId);
    const currentPhase = session.currentPhase;
    const phaseConfig = AUDIT_PHASES[currentPhase];

    // If we're in a collection phase, check if the answer is worth probing
    if (COLLECTION_PHASES.includes(currentPhase)) {
      const shouldProbe =
        phaseConfig.probe &&
        answerText.trim().length < 30 &&
        !this.hasProbeForPhase(session, currentPhase);

      if (shouldProbe) {
        // Record that we probed this phase
        this.markProbed(session, currentPhase);
        return {
          from: currentPhase,
          to: currentPhase, // Stay on same phase
          message: phaseConfig.probe!,
          done: false,
        };
      }

      // Record the answer
      const answer: AuditAnswer = {
        phase: currentPhase,
        question: phaseConfig.message,
        answer: answerText,
        timestamp: new Date().toISOString(),
      };
      session.answers.push(answer);
    }

    const nextPhase = phaseConfig.next;

    // If transitioning to synthesis, run the LLM synthesis
    if (nextPhase === 'synthesis') {
      session.currentPhase = 'synthesis';
      const synthesisMessage = AUDIT_PHASES['synthesis'].message;

      // Immediately set up delivery
      const synthesisOutput = await this.runSynthesis(session);
      session.synthesis = synthesisOutput;
      session.currentPhase = 'delivery';
      session.completedAt = new Date().toISOString();

      return {
        from: currentPhase,
        to: 'delivery',
        message: synthesisOutput,
        done: true,
        synthesisOutput,
      };
    }

    // If null, we're done (should only happen if already at delivery)
    if (nextPhase === null) {
      session.completedAt = new Date().toISOString();
      return {
        from: currentPhase,
        to: null,
        message: 'The audit is complete.',
        done: true,
      };
    }

    // Normal phase transition
    session.currentPhase = nextPhase;
    const nextMessage = AUDIT_PHASES[nextPhase].message;

    return {
      from: currentPhase,
      to: nextPhase,
      message: nextMessage,
      done: false,
    };
  }

  /** Get a summary of answers for a session (for context injection) */
  getAnswerSummary(sessionId: string): string {
    const session = this.getSession(sessionId);
    return session.answers
      .map((a) => `**${a.phase}**: ${a.answer}`)
      .join('\n\n');
  }

  /** Delete a session from memory */
  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** Get all active session IDs for a user */
  getUserSessions(userId: string): string[] {
    return [...this.sessions.values()]
      .filter((s) => s.userId === userId)
      .map((s) => s.id);
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private probedPhases = new Map<string, Set<AuditPhase>>();

  private hasProbeForPhase(session: AuditSession, phase: AuditPhase): boolean {
    return this.probedPhases.get(session.id)?.has(phase) ?? false;
  }

  private markProbed(session: AuditSession, phase: AuditPhase): void {
    if (!this.probedPhases.has(session.id)) {
      this.probedPhases.set(session.id, new Set());
    }
    this.probedPhases.get(session.id)!.add(phase);
  }

  private async runSynthesis(session: AuditSession): Promise<string> {
    const answerBlock = session.answers
      .map(
        (a) =>
          `## ${capitalize(a.phase)}\n${a.answer}`
      )
      .join('\n\n');

    const prompt = `Here are the answers from a life audit:\n\n${answerBlock}\n\nWrite your assessment now.`;

    try {
      return await this.router.complete({
        system: SYNTHESIS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 1024,
        temperature: 0.8,
      });
    } catch (err) {
      return `I ran into a problem generating your synthesis — ${err instanceof Error ? err.message : String(err)}. Here's what you shared:\n\n${answerBlock}`;
    }
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
