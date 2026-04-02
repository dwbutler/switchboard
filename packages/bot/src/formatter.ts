/**
 * Telegram MarkdownV2 formatter utilities.
 *
 * Telegram's `parse_mode: "MarkdownV2"` requires these characters to be
 * escaped with a backslash when they appear as literal text:
 *   _ * [ ] ( ) ~ ` > # + - = | { } . !
 *
 * Reference: https://core.telegram.org/bots/api#markdownv2-style
 */

// ---------------------------------------------------------------------------
// Escape helpers
// ---------------------------------------------------------------------------

/** Characters that must be backslash-escaped in MarkdownV2 plain text. */
const ESCAPE_CHARS = /[_*[\]()~`>#+\-=|{}.!\\]/g;

/**
 * Escape a plain-text string for safe use in a MarkdownV2 message body.
 * Does NOT touch any intentional markdown syntax — use this on raw user
 * input or dynamic values before embedding them in a formatted template.
 */
export function escapeMarkdownV2(text: string): string {
  return text.replace(ESCAPE_CHARS, (ch) => `\\${ch}`);
}

/**
 * Wrap text in **bold** (MarkdownV2).
 * The text itself is escaped first.
 */
export function bold(text: string): string {
  return `*${escapeMarkdownV2(text)}*`;
}

/**
 * Wrap text in _italic_ (MarkdownV2).
 * The text itself is escaped first.
 */
export function italic(text: string): string {
  return `_${escapeMarkdownV2(text)}_`;
}

/**
 * Wrap text in `inline code` (MarkdownV2).
 * Backtick and backslash inside are escaped.
 */
export function inlineCode(text: string): string {
  const escaped = text.replace(/[`\\]/g, (ch) => `\\${ch}`);
  return `\`${escaped}\``;
}

/**
 * Render a URL as a [label](url) hyperlink in MarkdownV2.
 */
export function link(label: string, url: string): string {
  const escapedLabel = escapeMarkdownV2(label);
  // URLs only need ) and \ escaped inside the URL portion
  const escapedUrl = url.replace(/[)\\]/g, (ch) => `\\${ch}`);
  return `[${escapedLabel}](${escapedUrl})`;
}

// ---------------------------------------------------------------------------
// Inline keyboard builders (returned as Telegram API objects)
// ---------------------------------------------------------------------------

export interface InlineButton {
  text: string;
  callback_data: string;
}

export type InlineKeyboard = InlineButton[][];

/**
 * Build a single-row inline keyboard from a list of buttons.
 */
export function singleRowKeyboard(buttons: InlineButton[]): InlineKeyboard {
  return [buttons];
}

/**
 * Build a stacked (one button per row) inline keyboard.
 */
export function stackedKeyboard(buttons: InlineButton[]): InlineKeyboard {
  return buttons.map((btn) => [btn]);
}

/**
 * Standard delivery-choice inline keyboard.
 * Shown at the end of the audit collection phase so the user can pick
 * how they want to receive the output.
 */
export function deliveryKeyboard(): InlineKeyboard {
  return stackedKeyboard([
    { text: "📥  Save to Knowledge Base", callback_data: "delivery:kb" },
    { text: "📄  Download as Markdown file", callback_data: "delivery:file" },
    { text: "✉️  Send summary here in chat", callback_data: "delivery:chat" },
  ]);
}

// ---------------------------------------------------------------------------
// Canned message builders
// ---------------------------------------------------------------------------

/**
 * Greeting message sent when the user first runs /start.
 */
export function buildWelcomeMessage(): string {
  return [
    bold("Welcome to Switchboard 👋"),
    "",
    escapeMarkdownV2(
      "I'm your personal life-audit assistant. I'll ask you a handful of " +
        "focused questions to help you clarify what matters most right now.",
    ),
    "",
    escapeMarkdownV2("Ready? Just reply with anything to begin, or send ") +
      inlineCode("/help") +
      escapeMarkdownV2(" to learn more."),
  ].join("\n");
}

/**
 * Help message.
 */
export function buildHelpMessage(): string {
  return [
    bold("Switchboard — commands"),
    "",
    `${inlineCode("/start")}  ${escapeMarkdownV2("— Begin a new life-audit session")}`,
    `${inlineCode("/reset")}  ${escapeMarkdownV2("— Discard the current session and start over")}`,
    `${inlineCode("/status")} ${escapeMarkdownV2("— Show where you are in the audit")}`,
    `${inlineCode("/help")}   ${escapeMarkdownV2("— Show this message")}`,
  ].join("\n");
}

/**
 * Phase-transition prompt builders.
 * Each returns a MarkdownV2-safe string ready to send as `parse_mode: MarkdownV2`.
 */
export function buildContextPrompt(): string {
  return [
    bold("Step 1 of 4 — Context"),
    "",
    escapeMarkdownV2(
      "Tell me a bit about your current situation. What do you do, " +
        "and what's been occupying most of your headspace lately?",
    ),
  ].join("\n");
}

export function buildValuesPrompt(): string {
  return [
    bold("Step 2 of 4 — Values"),
    "",
    escapeMarkdownV2(
      "What matters most to you right now? Think beyond work — " +
        "relationships, health, personal growth, creative projects…",
    ),
  ].join("\n");
}

export function buildTensionsPrompt(): string {
  return [
    bold("Step 3 of 4 — Tensions"),
    "",
    escapeMarkdownV2(
      "Where do you feel the most friction or conflict? " +
        "What's draining you, blocking you, or keeping you stuck?",
    ),
  ].join("\n");
}

export function buildPrioritiesPrompt(): string {
  return [
    bold("Step 4 of 4 — Priorities"),
    "",
    escapeMarkdownV2(
      "If you could only focus on one thing for the next 90 days, " +
        "what would it be, and why?",
    ),
  ].join("\n");
}

export function buildDeliveryPrompt(): string {
  return [
    bold("Almost done ✅"),
    "",
    escapeMarkdownV2(
      "Thanks — I have everything I need. How would you like to receive your audit summary?",
    ),
  ].join("\n");
}

export function buildGeneratingMessage(): string {
  return escapeMarkdownV2("⏳ Generating your audit… this may take a moment.");
}

export function buildDoneMessage(summaryOrPath: string): string {
  return [
    bold("Your audit is ready 🎉"),
    "",
    escapeMarkdownV2(summaryOrPath),
  ].join("\n");
}

export function buildErrorMessage(reason?: string): string {
  const base = escapeMarkdownV2(
    "Something went wrong. Please try again or send /reset to start over.",
  );
  if (!reason) return base;
  return `${base}\n\n${italic(escapeMarkdownV2(reason))}`;
}

export function buildStatusMessage(phase: string, stepsDone: number): string {
  return [
    bold("Session status"),
    "",
    `${escapeMarkdownV2("Phase:")} ${inlineCode(phase)}`,
    `${escapeMarkdownV2("Answers collected:")} ${escapeMarkdownV2(String(stepsDone))}`,
  ].join("\n");
}
