/**
 * @switchboard/bot — public API surface.
 *
 * Consumer packages (e.g. @switchboard/server) should import from here.
 */

// Session management
export {
  type AuditPhase,
  type BotSession,
  advancePhase,
  deleteSession,
  getOrCreateSession,
  recordAnswer,
  saveSession,
} from "./session.js";

// Formatter utilities
export {
  bold,
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
  escapeMarkdownV2,
  inlineCode,
  italic,
  type InlineButton,
  type InlineKeyboard,
  link,
  singleRowKeyboard,
  stackedKeyboard,
} from "./formatter.js";

// Bot logic
export {
  type BotReply,
  type DeliveryChoice,
  defaultGenerateAudit,
  handleDeliveryCallback,
  handleHelp,
  handleMessage,
  handleReset,
  handleStart,
  handleStatus,
  phaseLabel,
} from "./bot.js";

// grammy integration
export { createBot, registerHandlers } from "./handler.js";

// Agent orchestration
export { BotAgent } from "./agent.js";
