/**
 * Spinner — shows a "thinking" indicator while the bot is processing.
 */

import React from "react";
import { Box, Text } from "ink";
import InkSpinner from "ink-spinner";

interface SpinnerProps {
  label?: string;
}

export function Spinner({ label = "Thinking…" }: SpinnerProps): React.ReactElement {
  return (
    <Box>
      {/* ink-spinner wraps with its own Text internally */}
      <Text color="green">
        <InkSpinner type="dots" />
      </Text>
      <Text> {label}</Text>
    </Box>
  );
}
