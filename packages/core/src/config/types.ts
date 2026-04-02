/**
 * Switchboard user config — stored at ~/.switchboard/config.json
 */

export type ConfigModelProvider = 'ollama' | 'anthropic' | 'openai';

export interface SwitchboardConfig {
  /** Which provider to use first. Defaults to "ollama". */
  modelProvider?: ConfigModelProvider;
  /** Ollama base URL. Defaults to http://localhost:11434 */
  ollamaBaseUrl?: string;
  /** Ollama model name. Defaults to "llama3.2" */
  ollamaModel?: string;
  /** Anthropic API key (BYOK) */
  anthropicApiKey?: string;
  /** Anthropic model name */
  anthropicModel?: string;
  /** OpenAI API key (BYOK) */
  openaiApiKey?: string;
  /** OpenAI model name */
  openaiModel?: string;
  /** Telegram bot token */
  telegramBotToken?: string;
  /** Fastify gateway port. Defaults to 3000. */
  gatewayPort?: number;
  /** Last updated timestamp (ISO 8601) */
  updatedAt?: string;
}

export const CONFIG_DEFAULTS: Required<
  Omit<SwitchboardConfig, 'anthropicApiKey' | 'openaiApiKey' | 'telegramBotToken'>
> = {
  modelProvider: 'ollama',
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.2',
  anthropicModel: 'claude-3-5-haiku-20241022',
  openaiModel: 'gpt-4o-mini',
  gatewayPort: 3000,
  updatedAt: '',
};
