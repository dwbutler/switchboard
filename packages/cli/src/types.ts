/**
 * Shared types for the CLI package.
 */

export type MessageRole = "user" | "bot" | "system";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
}

export interface ChatState {
  messages: ChatMessage[];
  isThinking: boolean;
  error: string | null;
}
