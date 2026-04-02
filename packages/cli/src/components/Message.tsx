/**
 * Message — renders a single chat message with role label.
 */

import React from "react";
import { Box, Text } from "ink";
import type { ChatMessage } from "../types.js";

interface MessageProps {
  message: ChatMessage;
}

const ROLE_LABELS: Record<string, string> = {
  user: "You",
  bot: "Switchboard",
  system: "System",
};

const ROLE_COLORS: Record<string, string> = {
  user: "cyan",
  bot: "green",
  system: "yellow",
};

export function Message({ message }: MessageProps): React.ReactElement {
  const label = ROLE_LABELS[message.role] ?? message.role;
  const color = ROLE_COLORS[message.role] ?? "white";

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={color as any} bold>
        {label}
      </Text>
      <Box marginLeft={2}>
        <Text wrap="wrap">{message.content}</Text>
      </Box>
    </Box>
  );
}
