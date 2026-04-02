/**
 * Agent orchestration types — shared contracts for Switchboard's multi-agent layer.
 *
 * These types define the message envelope and routing context that every agent
 * implementation should speak. Concrete agent packages (e.g. @switchboard/bot)
 * import from here so the colony stays in sync.
 */

// ── Message envelope ──────────────────────────────────────────────────────

/** Role of a participant in an agent conversation turn. */
export type AgentRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * A single message in an agent conversation thread.
 * This is the canonical envelope — richer than `ChatMessage` because it
 * carries agent identity, turn metadata, and optional tool payloads.
 */
export interface AgentMessage {
  /** Unique message ID (caller-generated, e.g. crypto.randomUUID()). */
  id: string;
  /** Identifies which agent produced or is the target of this message. */
  agentId: string;
  /** Conversation thread this message belongs to. */
  threadId: string;
  /** Who authored the message. */
  role: AgentRole;
  /** Primary text content of the message. */
  content: string;
  /** ISO-8601 timestamp of creation. */
  createdAt: string;
  /** Optional structured payload (e.g. tool call args / results). */
  payload?: Record<string, unknown>;
}

// ── Routing context ───────────────────────────────────────────────────────

/**
 * Context object passed into every routing decision.
 * The model router and agent dispatcher use this to choose the right
 * provider, persona, and tool-set for a given turn.
 */
export interface RoutingContext {
  /** Active conversation thread. */
  threadId: string;
  /** ID of the agent being invoked. */
  agentId: string;
  /**
   * Persona / capability tag used to select prompt templates.
   * e.g. "life-audit", "kb-writer", "general"
   */
  persona?: string;
  /**
   * Preferred model provider for this turn.
   * Falls back to ModelRouterConfig providerOrder when undefined.
   */
  preferredProvider?: 'ollama' | 'anthropic' | 'openai';
  /** Hard override for the model name (provider-specific). */
  modelOverride?: string;
  /** Additional key-value metadata the agent or UI layer wants to attach. */
  metadata?: Record<string, unknown>;
}

// ── Agent descriptor ──────────────────────────────────────────────────────

/**
 * Static descriptor for a registered agent.
 * Used by the dispatcher to look up agents by ID and build routing tables.
 */
export interface AgentDescriptor {
  /** Globally unique agent ID (e.g. "life-audit-agent"). */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Short description for UI / logging. */
  description?: string;
  /** Default persona used in RoutingContext when not overridden. */
  defaultPersona?: string;
  /** Tool names this agent exposes (for capability discovery). */
  tools?: string[];
}
