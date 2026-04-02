/**
 * App — root Ink application component.
 * Manages chat state and bridges user input to the bot adapter.
 */

import React, { useState, useCallback, useEffect } from "react";
import { Box, Text } from "ink";
import type { ChatMessage, ChatState } from "../types.js";
import { Chat } from "./Chat.js";
import type { CliBot } from "../cli-bot.js";

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface AppProps {
  /** Optional greeting message to show on launch */
  greeting?: string;
  /** Bot adapter instance — injected so commands can configure it */
  bot: CliBot;
}

export function App({ greeting, bot }: AppProps): React.ReactElement {
  const [state, setState] = useState<ChatState>(() => {
    const initial: ChatMessage[] = greeting
      ? [
          {
            id: makeId(),
            role: "bot",
            content: greeting,
            timestamp: new Date(),
          },
        ]
      : [];
    return { messages: initial, isThinking: false, error: null };
  });

  // Let the bot push messages reactively (e.g. streaming future support)
  useEffect(() => {
    bot.onMessage = (content: string) => {
      setState((prev) => ({
        ...prev,
        isThinking: false,
        error: null,
        messages: [
          ...prev.messages,
          {
            id: makeId(),
            role: "bot",
            content,
            timestamp: new Date(),
          },
        ],
      }));
    };

    bot.onError = (err: string) => {
      setState((prev) => ({ ...prev, isThinking: false, error: err }));
    };

    return () => {
      bot.onMessage = undefined;
      bot.onError = undefined;
    };
  }, [bot]);

  const handleSend = useCallback(
    (userInput: string) => {
      // Append user message immediately
      const userMsg: ChatMessage = {
        id: makeId(),
        role: "user",
        content: userInput,
        timestamp: new Date(),
      };

      setState((prev) => ({
        ...prev,
        isThinking: true,
        error: null,
        messages: [...prev.messages, userMsg],
      }));

      // Dispatch to bot async (result comes back via onMessage / onError)
      bot.send(userInput);
    },
    [bot],
  );

  return (
    <Box flexDirection="column" height={process.stdout.rows ?? 24}>
      {/* ── Header ── */}
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
      </Box>

      {/* ── Chat area ── */}
      <Chat state={state} onSend={handleSend} />
    </Box>
  );
}
