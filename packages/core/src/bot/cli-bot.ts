/**
 * CliBot — thin conversational wrapper around ModelRouter for the CLI app.
 *
 * Responsibilities:
 *  - Load config from ~/.switchboard/config.json and merge with caller overrides
 *  - Maintain a per-session message history (passed on every turn for context)
 *  - Expose callback hooks (onMessage, onError) so the Ink UI stays decoupled
 *  - Provide start() for an optional greeting and send() for user turns
 *
 * Design notes:
 *  - Async callbacks are fire-and-forget from the caller's perspective; the bot
 *    resolves them internally and calls back via onMessage/onError.
 *  - The session history is capped at MAX_HISTORY_TURNS to bound memory and
 *    token usage on long-running CLI sessions.
 *  - send()       — full response, delivered to onMessage when complete.
 *  - sendStream() — streaming response; onChunk(delta) fires per token,
 *                   onMessage fires with the full text when done,
 *                   onError fires (never throws) on failure.
 */

import { loadModelRouterConfig } from '../config/config.js';
import { ModelRouter } from '../model/router.js';
import type { ChatMessage } from '../model/types.js';

// ── Public types ──────────────────────────────────────────────────────────

/** Configuration accepted by the CliBot constructor. */
export interface CliBotConfig {
  /**
   * Optional model override — provider-specific name passed straight through
   * to ModelRouter (e.g. "llama3.2", "claude-3-5-haiku-20241022").
   * When omitted the user's config.json default is used.
   */
  model?: string;

  /**
   * System prompt shown to the model on every turn.
   * Defaults to a friendly Switchboard persona.
   */
  systemPrompt?: string;

  /**
   * Maximum number of (user + assistant) message pairs to retain in history.
   * Older turns are dropped to keep context windows manageable.
   * Defaults to 20 pairs (40 individual messages).
   */
  maxHistoryTurns?: number;

  /**
   * Greeting message returned by start().
   * Set to an empty string to skip the greeting entirely.
   * Defaults to a short welcome message.
   */
  greeting?: string;
}

/** Callback invoked when the bot produces a complete response. */
export type MessageHandler = (content: string) => void;

/**
 * Callback invoked incrementally with each token delta during streaming.
 * Called on every chunk from sendStream(); the `full` parameter carries the
 * entire accumulated text so far (useful for live-replace rendering).
 */
export type ChunkHandler = (delta: string, full: string) => void;

/** Callback invoked when an error occurs during a send/start operation. */
export type ErrorHandler = (error: Error) => void;

// ── Constants ─────────────────────────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `\
You are Switchboard, a helpful AI assistant embedded in a terminal CLI.
Be concise and clear. Format responses for plain text — no markdown headers \
or bullet lists unless the user explicitly asks for them.`;

const DEFAULT_GREETING =
  "Hello! I'm Switchboard. How can I help you today?";

const MAX_HISTORY_TURNS = 20;

// ── CliBot ────────────────────────────────────────────────────────────────

export class CliBot {
  private config: Required<CliBotConfig>;
  private router: ModelRouter | null = null;
  private history: ChatMessage[] = [];

  /** Fired when a complete bot response arrives (send) or streaming finishes (sendStream). */
  onMessage: MessageHandler | null = null;

  /**
   * Fired incrementally during sendStream() for each token delta.
   * Arguments: (delta, fullAccumulatedText)
   * Ignored when using non-streaming send().
   */
  onChunk: ChunkHandler | null = null;

  /** Fired when an error occurs. Set before calling start(). */
  onError: ErrorHandler | null = null;

  constructor(config: CliBotConfig = {}) {
    this.config = {
      model: config.model ?? '',
      systemPrompt: config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      maxHistoryTurns: config.maxHistoryTurns ?? MAX_HISTORY_TURNS,
      greeting: config.greeting ?? DEFAULT_GREETING,
    };
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  /**
   * Initialise the bot: load config from disk, build the ModelRouter.
   * Returns the greeting string (or empty string if greeting is disabled).
   * Must be called before send().
   */
  async start(): Promise<string> {
    // Load config from ~/.switchboard/config.json and init the router
    const routerConfig = await loadModelRouterConfig();
    this.router = new ModelRouter(routerConfig);

    return this.config.greeting;
  }

  /**
   * Send a user message to the model and deliver the response via onMessage.
   * Also appends both the user turn and the assistant turn to history.
   *
   * Errors are caught and forwarded to onError (they are NOT re-thrown) so
   * the Ink render loop is never broken by a failed LLM call.
   */
  async send(userInput: string): Promise<void> {
    if (!this.router) {
      this.handleError(
        new Error('CliBot.send() called before start(). Call bot.start() first.'),
      );
      return;
    }

    // Append the user turn to history
    this.history.push({ role: 'user', content: userInput });

    // Trim history to cap (keep most-recent pairs; always keep last user msg)
    const maxMessages = this.config.maxHistoryTurns * 2;
    if (this.history.length > maxMessages) {
      this.history = this.history.slice(this.history.length - maxMessages);
    }

    try {
      const response = await this.router.complete({
        system: this.config.systemPrompt,
        messages: this.history,
        // Only pass model override when it was explicitly set
        ...(this.config.model ? { model: this.config.model } : {}),
      });

      // Record assistant turn in history
      this.history.push({ role: 'assistant', content: response });

      // Deliver to UI
      if (this.onMessage) {
        this.onMessage(response);
      }
    } catch (err) {
      // Remove the user message we optimistically added — the turn failed
      this.history.pop();
      this.handleError(
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }

  /**
   * Send a user message and stream the response token-by-token.
   *
   * Lifecycle:
   *  1. User message appended to history.
   *  2. onChunk(delta, fullSoFar) fired for each token as it arrives.
   *  3. onMessage(fullResponse) fired once the stream ends.
   *  4. Assistant turn appended to history with the complete text.
   *
   * On error: the optimistically added user message is rolled back,
   * onError is called, and the method returns without throwing.
   *
   * Falls through the ModelRouter's provider order (ollama → anthropic →
   * openai) just like send(), so streaming degrades gracefully if a
   * provider isn't available.
   */
  async sendStream(userInput: string): Promise<void> {
    if (!this.router) {
      this.handleError(
        new Error('CliBot.sendStream() called before start(). Call bot.start() first.'),
      );
      return;
    }

    // Append the user turn to history
    this.history.push({ role: 'user', content: userInput });

    // Trim history to cap (most-recent pairs; always keep the user msg we just added)
    const maxMessages = this.config.maxHistoryTurns * 2;
    if (this.history.length > maxMessages) {
      this.history = this.history.slice(this.history.length - maxMessages);
    }

    let accumulated = '';

    try {
      const fullResponse = await this.router.completeStream(
        {
          system: this.config.systemPrompt,
          messages: this.history,
          ...(this.config.model ? { model: this.config.model } : {}),
        },
        (delta: string) => {
          accumulated += delta;
          if (this.onChunk) {
            this.onChunk(delta, accumulated);
          }
        },
      );

      // Record assistant turn in history
      this.history.push({ role: 'assistant', content: fullResponse });

      // Deliver the complete text to the message handler
      if (this.onMessage) {
        this.onMessage(fullResponse);
      }
    } catch (err) {
      // Roll back the optimistically added user message
      this.history.pop();
      this.handleError(
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  /** Clear the conversation history (useful for /reset commands). */
  clearHistory(): void {
    this.history = [];
  }

  /** Snapshot of current history (read-only copy). */
  getHistory(): ReadonlyArray<ChatMessage> {
    return [...this.history];
  }

  /**
   * Switch the active model on the fly.
   * Takes effect immediately — the next send()/sendStream() call will use
   * the new model name.  Pass an empty string to revert to the config default.
   *
   * Example:
   *   bot.setModel('claude-3-5-haiku-20241022');
   *   bot.setModel('llama3.2');
   *   bot.setModel('');  // revert to default
   */
  setModel(name: string): void {
    this.config.model = name;
  }

  /**
   * Return the currently active model override, or an empty string if the
   * bot is using the default from config.json.
   */
  getModel(): string {
    return this.config.model;
  }

  private handleError(error: Error): void {
    if (this.onError) {
      this.onError(error);
    } else {
      // Surface to console if no handler registered — prevents silent failures
      console.error('[CliBot]', error.message);
    }
  }
}
