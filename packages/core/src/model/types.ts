/**
 * Shared types for the model router layer.
 */

export type ModelProvider = 'ollama' | 'anthropic' | 'openai';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface CompletionRequest {
  /** Optional system prompt. Passed as first system message if provided. */
  system?: string;
  messages: ChatMessage[];
  /** Max tokens for the response. Defaults to 2048. */
  maxTokens?: number;
  /** Temperature 0–1. Defaults to 0.7. */
  temperature?: number;
  /** Override model name (provider-specific). */
  model?: string;
}

export interface CompletionResponse {
  content: string;
  provider: ModelProvider;
  model: string;
  /** Whether a fallback provider was used */
  usedFallback: boolean;
}

export interface ModelRouterConfig {
  /** Ollama base URL. Defaults to http://localhost:11434 */
  ollamaBaseUrl?: string;
  /** Default Ollama model. Defaults to "llama3.2" */
  ollamaModel?: string;
  /** Anthropic API key (BYOK) */
  anthropicApiKey?: string;
  /** Default Anthropic model. Defaults to "claude-3-5-haiku-20241022" */
  anthropicModel?: string;
  /** OpenAI API key (BYOK) */
  openaiApiKey?: string;
  /** Default OpenAI model. Defaults to "gpt-4o-mini" */
  openaiModel?: string;
  /** Provider preference order. Defaults to ["ollama", "anthropic", "openai"] */
  providerOrder?: ModelProvider[];
}
