/**
 * apps/cli — Ink entry point.
 *
 * `renderCli()` is called by the `chat` command in index.ts.
 * It boots the Ink application, starts the CliBot session, and renders
 * the root <App> component.
 *
 * Keeping this in a separate module (cli.tsx) from the Commander entry
 * point (index.ts) means React/Ink are only loaded when the `chat`
 * subcommand is actually invoked — other subcommands pay zero overhead.
 *
 * NOTE: Node16 module resolution requires .js extensions on all
 * relative imports even though the source files are .ts/.tsx.
 */

import React from "react";
import { render, Box, Text, useApp, useInput } from "ink";
import { useState, useEffect, useCallback, useRef } from "react";
import { CliBot } from "@switchboard/core";
import type { CliBotConfig } from "@switchboard/core";

// ── Types ─────────────────────────────────────────────────────────────────

export interface RenderCliOptions {
  /** Optional model override — forwarded to CliBotConfig */
  model?: string;
  /** Whether ANSI colour is enabled */
  color?: boolean;
}

export type MessageRole = "user" | "bot" | "system";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  /** True while this message is still being streamed in */
  streaming?: boolean;
  timestamp: Date;
}

export interface ChatState {
  messages: ChatMessage[];
  isThinking: boolean;
  error: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeMessage(
  role: MessageRole,
  content: string,
  streaming = false,
): ChatMessage {
  return { id: makeId(), role, content, streaming, timestamp: new Date() };
}

// ── <MessageRow> component ────────────────────────────────────────────────

interface MessageRowProps {
  message: ChatMessage;
}

function MessageRow({ message }: MessageRowProps): React.ReactElement {
  const isUser = message.role === "user";
  const isBot = message.role === "bot";

  return (
    <Box marginBottom={0} flexDirection="row">
      <Text color={isUser ? "green" : isBot ? "cyan" : "gray"} bold={isUser}>
        {isUser ? "you  " : isBot ? "  sw " : "sys  "}
      </Text>
      <Text wrap="wrap">
        {message.content}
        {/* Blinking cursor shown only while this message is still streaming */}
        {message.streaming && (
          <Text color="cyan" bold>
            ▌
          </Text>
        )}
      </Text>
    </Box>
  );
}

// ── <App> root component ──────────────────────────────────────────────────

interface AppProps {
  options: RenderCliOptions;
}

function App({ options }: AppProps): React.ReactElement {
  const { exit } = useApp();

  // Stable bot ref — never reassigned after mount so it's safe in callbacks
  const botRef = useRef<CliBot | null>(null);

  // Tracks the id of the message currently being streamed (null when idle)
  const streamingIdRef = useRef<string | null>(null);

  const [state, setState] = useState<ChatState>({
    messages: [],
    isThinking: false,
    error: null,
  });

  const [inputValue, setInputValue] = useState<string>("");

  /**
   * Tracks the active model label shown in the header.
   * Initialised from options.model; updated live by the /model slash command.
   */
  const [activeModel, setActiveModel] = useState<string>(options.model ?? "");

  // ── Helpers (stable references) ────────────────────────────────────────

  const appendMessage = useCallback((msg: ChatMessage) => {
    setState((prev) => ({
      ...prev,
      isThinking: false,
      error: null,
      messages: [...prev.messages, msg],
    }));
  }, []);

  const setError = useCallback((message: string) => {
    setState((prev) => ({ ...prev, isThinking: false, error: message }));
  }, []);

  // ── Boot — instantiate CliBot, wire callbacks, call start() ───────────

  useEffect(() => {
    const botConfig: CliBotConfig = {
      // Forward the --model flag from the CLI invocation when provided
      ...(options.model ? { model: options.model } : {}),
    };

    const bot = new CliBot(botConfig);
    botRef.current = bot;

    // ── onChunk: token arrives during streaming ──────────────────────────
    // Find the streaming placeholder message by id and append the delta.
    bot.onChunk = (_delta: string, full: string) => {
      const id = streamingIdRef.current;
      if (!id) return;

      setState((prev) => ({
        ...prev,
        // Clear the "thinking" spinner once the first token arrives
        isThinking: false,
        messages: prev.messages.map((m) =>
          m.id === id ? { ...m, content: full, streaming: true } : m,
        ),
      }));
    };

    // ── onMessage: stream complete (or non-streaming send() done) ────────
    // Mark the streaming message as finalised so the cursor glyph disappears.
    bot.onMessage = (content: string) => {
      const id = streamingIdRef.current;
      if (id) {
        // Finalise the streaming message
        setState((prev) => ({
          ...prev,
          isThinking: false,
          error: null,
          messages: prev.messages.map((m) =>
            m.id === id
              ? { ...m, content, streaming: false }
              : m,
          ),
        }));
        streamingIdRef.current = null;
      } else {
        // Non-streaming path (fallback) — just append
        appendMessage(makeMessage("bot", content));
      }
    };

    // ── onError: LLM/network failure → surface inline ────────────────────
    bot.onError = (error: Error) => {
      // Remove the streaming placeholder if one exists
      const id = streamingIdRef.current;
      if (id) {
        setState((prev) => ({
          ...prev,
          isThinking: false,
          error: `Error: ${error.message}`,
          messages: prev.messages.filter((m) => m.id !== id),
        }));
        streamingIdRef.current = null;
      } else {
        setError(`Error: ${error.message}`);
      }
    };

    // start() loads ~/.switchboard/config.json, builds ModelRouter, returns greeting
    bot.start().then((greeting) => {
      if (greeting) {
        appendMessage(makeMessage("bot", greeting));
      }
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to start bot: ${msg}`);
    });

    // Cleanup: clear callbacks to avoid stale-closure updates after unmount
    return () => {
      bot.onChunk = null;
      bot.onMessage = null;
      bot.onError = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — runs once on mount

  // ── Slash-command dispatcher ───────────────────────────────────────────

  /**
   * List of recognised slash commands shown by /help.
   * Kept as a constant so it stays in sync with the handler below without
   * needing to be re-declared on every render.
   */
  const SLASH_COMMANDS = [
    { cmd: "/help",          desc: "Show available slash commands" },
    { cmd: "/reset",         desc: "Clear conversation history" },
    { cmd: "/model <name>",  desc: "Switch active model (e.g. /model llama3.2)" },
    { cmd: "/model",         desc: "Show the currently active model" },
  ] as const;

  /**
   * Intercept slash-commands before they reach the LLM.
   * Returns `true` if the input was handled locally, `false` if it should
   * be forwarded to `bot.sendStream()` as a normal user turn.
   */
  const handleSlashCommand = useCallback(
    (raw: string): boolean => {
      const bot = botRef.current;
      if (!bot) return false;

      // Only intercept strings that start with "/"
      if (!raw.startsWith("/")) return false;

      const [cmd, ...rest] = raw.trim().split(/\s+/);
      const arg = rest.join(" ");

      switch (cmd?.toLowerCase()) {
        // ── /help ────────────────────────────────────────────────────────
        case "/help": {
          const lines = [
            "Available commands:",
            ...SLASH_COMMANDS.map((c) => `  ${c.cmd.padEnd(20)} ${c.desc}`),
          ].join("\n");
          appendMessage(makeMessage("user", raw));
          appendMessage(makeMessage("system", lines));
          return true;
        }

        // ── /reset ───────────────────────────────────────────────────────
        case "/reset": {
          bot.clearHistory();
          appendMessage(makeMessage("user", raw));
          appendMessage(
            makeMessage("system", "Conversation history cleared. Starting fresh."),
          );
          return true;
        }

        // ── /model ───────────────────────────────────────────────────────
        case "/model": {
          if (!arg) {
            // No argument — report current model
            const current = bot.getModel();
            const label = current || "(default from config)";
            appendMessage(makeMessage("user", raw));
            appendMessage(makeMessage("system", `Active model: ${label}`));
          } else {
            // Switch model live
            bot.setModel(arg);
            setActiveModel(arg);
            appendMessage(makeMessage("user", raw));
            appendMessage(
              makeMessage("system", `Model switched to: ${arg}`),
            );
          }
          return true;
        }

        // ── Unknown slash command ─────────────────────────────────────────
        default: {
          appendMessage(makeMessage("user", raw));
          appendMessage(
            makeMessage(
              "system",
              `Unknown command: ${cmd ?? raw}. Type /help to see available commands.`,
            ),
          );
          return true;
        }
      }
    },
    [appendMessage, SLASH_COMMANDS],
  );

  // ── Send handler ───────────────────────────────────────────────────────

  const handleSend = useCallback(
    (userInput: string) => {
      const bot = botRef.current;
      if (!bot) return;

      // Intercept slash-commands — if handled locally, do not forward to LLM
      if (handleSlashCommand(userInput)) return;

      // Optimistically append the user message immediately
      appendMessage(makeMessage("user", userInput));

      // Create a streaming placeholder for the bot reply and register its id
      const placeholder = makeMessage("bot", "", true);
      streamingIdRef.current = placeholder.id;

      // Show the placeholder + thinking indicator
      setState((prev) => ({
        ...prev,
        isThinking: true,
        error: null,
        messages: [...prev.messages, placeholder],
      }));

      // Use streaming — onChunk fires per token, onMessage fires when done
      bot.sendStream(userInput).catch((err: unknown) => {
        // sendStream() itself swallows errors into onError, but guard anyway
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Unexpected send error: ${msg}`);
      });
    },
    [appendMessage, setError, handleSlashCommand],
  );

  // ── Keyboard input ─────────────────────────────────────────────────────

  useInput((input, key) => {
    if (key.ctrl && (input === "c" || input === "d")) {
      exit();
      return;
    }

    // Backspace
    if (key.backspace || key.delete) {
      setInputValue((prev) => prev.slice(0, -1));
      return;
    }

    // Enter → submit
    if (key.return) {
      const trimmed = inputValue.trim();
      if (!trimmed || state.isThinking) return;
      handleSend(trimmed);
      setInputValue("");
      return;
    }

    // Printable chars
    if (input && !key.ctrl && !key.meta) {
      setInputValue((prev) => prev + input);
    }
  });

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <Box flexDirection="column" height={process.stdout.rows ?? 24}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <Box
        borderStyle="round"
        borderColor="cyan"
        paddingX={1}
        marginBottom={0}
        justifyContent="center"
      >
        <Text color="cyan" bold>
          ✦ Switchboard
        </Text>
        {activeModel && (
          <Text color="gray" dimColor>
            {" "}
            [{activeModel}]
          </Text>
        )}
      </Box>

      {/* ── Message history ─────────────────────────────────────────── */}
      <Box flexDirection="column" flexGrow={1} paddingX={1} overflowY="hidden">
        {state.messages.map((msg) => (
          <MessageRow key={msg.id} message={msg} />
        ))}

        {/* Thinking spinner shown only before the first token arrives */}
        {state.isThinking && (
          <Box>
            <Text color="cyan" dimColor>
              ⠋ thinking…
            </Text>
          </Box>
        )}

        {state.error && (
          <Box marginTop={1}>
            <Text color="red">⚠ {state.error}</Text>
          </Box>
        )}
      </Box>

      {/* ── Input divider ───────────────────────────────────────────── */}
      <Box
        borderStyle="single"
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        paddingX={1}
      >
        <Text color="gray" dimColor>
          Enter to send  •  /help for commands  •  Ctrl+C to exit
        </Text>
      </Box>

      {/* ── Input row ───────────────────────────────────────────────── */}
      <Box paddingX={1}>
        <Text color="cyan">&gt; </Text>
        <Text>{inputValue}</Text>
        <Text color="cyan" bold>
          ▌
        </Text>
      </Box>
    </Box>
  );
}

// ── renderCli ─────────────────────────────────────────────────────────────

/**
 * Boot the Ink application.
 * Called from `index.ts` when the `chat` subcommand is dispatched.
 */
export async function renderCli(options: RenderCliOptions = {}): Promise<void> {
  const { waitUntilExit } = render(<App options={options} />, {
    exitOnCtrlC: false, // we handle Ctrl+C ourselves via useInput
  });

  await waitUntilExit();
}
