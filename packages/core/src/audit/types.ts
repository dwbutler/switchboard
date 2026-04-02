/**
 * Life Audit types — the structured interview flow that collects
 * user context across life domains, then synthesizes insights.
 */

export type AuditPhase =
  | 'greeting'
  | 'basics'
  | 'work'
  | 'health'
  | 'relationships'
  | 'goals'
  | 'synthesis'
  | 'delivery';

export interface AuditPhaseConfig {
  phase: AuditPhase;
  /** Bot message / question to send to the user */
  message: string;
  /** Follow-up probe (used if user gives a short/vague answer) */
  probe?: string;
  /** Which phase comes next (null means audit is complete) */
  next: AuditPhase | null;
}

export interface AuditAnswer {
  phase: AuditPhase;
  question: string;
  answer: string;
  timestamp: string; // ISO 8601
}

export interface AuditSession {
  id: string;
  userId: string;
  currentPhase: AuditPhase;
  answers: AuditAnswer[];
  startedAt: string; // ISO 8601
  completedAt?: string; // ISO 8601
  synthesis?: string; // Final synthesized output
}

export interface AuditTransition {
  from: AuditPhase;
  to: AuditPhase | null;
  /** The message to deliver for the NEW phase */
  message: string;
  /** True if the audit is now complete */
  done: boolean;
}
