/**
 * Chat — scrollable message history + text input.
 * Handles user typing and dispatching messages to the bot.
 */

import React, { useState, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import type { ChatMessage, ChatState } from "../types.js";
import { Message } from "./Message.js";
import { Spinner } from "./Spinner.js";

interface ChatProps {
  state: ChatState;
  onSend: (userInput: string) => void;
}

export function Chat({ state, onSend }: ChatProps): React.ReactElement {
  const [inputValue, setInputValue] = useState<string>("");
  const { exit } = useApp();

  // Ctrl+C / Ctrl+D → exit
  useInput((_input, key) => {
    if (key.ctrl && (_input === "c" || _input === "d")) {
      exit();
    }
  });

  const handleSubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || state.isThinking) return;
      setInputValue("");
      onSend(trimmed);
    },
    [state.isThinking, onSend],
  );

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* ── Message history ── */}
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {state.messages.map((msg: ChatMessage) => (
          <Message key={msg.id} message={msg} />
        ))}

        {state.isThinking && <Spinner />}

        {state.error && (
          <Box marginTop={1}>
            <Text color="red">⚠ {state.error}</Text>
          </Box>
        )}
      </Box>

      {/* ── Divider ── */}
      <Box borderStyle="single" borderBottom={false} borderLeft={false} borderRight={false} paddingX={1}>
        <Text color="gray" dimColor>
          Type a message and press Enter  •  Ctrl+C to exit
        </Text>
      </Box>

      {/* ── Input row ── */}
      <Box paddingX={1} paddingY={0}>
        <Text color="cyan">&gt; </Text>
        <TextInput
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSubmit}
          placeholder="Ask anything…"
          focus={!state.isThinking}
        />
      </Box>
    </Box>
  );
}
