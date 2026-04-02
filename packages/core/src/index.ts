/**
 * @switchboard/core — barrel export
 *
 * Re-exports all public APIs from the core package:
 * - KB (Knowledge Base types, writer, synthesizer)
 * - Model router (Ollama + Anthropic + OpenAI)
 * - Life audit state machine
 * - OTP auth
 * - Workspace scaffold
 * - Config reader/writer
 */

// ── Knowledge Base ────────────────────────────────────────────────────────
export type { KBCategory, KBEntry, KBWriteResult, KBSearchResult } from './kb/types.js';
export { slugify, KBWriter } from './kb/writer.js';
export { KBSynthesizer } from './kb/synthesizer.js';
export type { SynthesisInput, SynthesisResult } from './kb/synthesizer.js';

// ── Model Router ──────────────────────────────────────────────────────────
export type {
  ModelProvider,
  ChatMessage,
  CompletionRequest,
  CompletionResponse,
  ModelRouterConfig,
} from './model/types.js';
export { ModelRouter } from './model/router.js';
export type { StreamChunkHandler } from './model/router.js';

// ── Life Audit ────────────────────────────────────────────────────────────
export type {
  AuditPhase,
  AuditPhaseConfig,
  AuditAnswer,
  AuditSession,
  AuditTransition,
} from './audit/types.js';
export { AUDIT_PHASES, AUDIT_PHASE_ORDER, COLLECTION_PHASES } from './audit/phases.js';
export { LifeAuditStateMachine } from './audit/state-machine.js';

// ── OTP Auth ──────────────────────────────────────────────────────────────
export type { OTPRecord, OTPVerifyResult } from './auth/otp.js';
export { OTPService, otpService } from './auth/otp.js';

// ── Workspace Scaffold ────────────────────────────────────────────────────
export type { ScaffoldOptions, ScaffoldResult } from './scaffold/workspace.js';
export {
  scaffoldWorkspace,
  isWorkspaceScaffolded,
  getSwitchboardWorkspaceDir,
} from './scaffold/workspace.js';
export {
  agentsMdTemplate,
  memoryMdTemplate,
  kbReadmeTemplate,
  openclawJsonTemplate,
} from './scaffold/templates.js';

// ── Config ────────────────────────────────────────────────────────────────
export type { ConfigModelProvider, SwitchboardConfig } from './config/types.js';
export { CONFIG_DEFAULTS } from './config/types.js';
export {
  getSwitchboardDir,
  getConfigPath,
  readConfig,
  writeConfig,
  updateConfig,
  loadModelRouterConfig,
} from './config/config.js';

// ── CLI Bot ───────────────────────────────────────────────────────────────
export { CliBot } from './bot/cli-bot.js';
export type { CliBotConfig, MessageHandler, ChunkHandler, ErrorHandler } from './bot/cli-bot.js';

// ── Agent orchestration types ─────────────────────────────────────────────
export type { AgentRole, AgentMessage, RoutingContext, AgentDescriptor } from './types/index.js';
