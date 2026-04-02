/**
 * Model Router — tries Ollama first, falls back to Anthropic or OpenAI
 * if BYOK keys are configured in ~/.switchboard/config.json.
 *
 * Priority: ollama → anthropic → openai (configurable via providerOrder)
 *
 * Streaming support:
 *   completeStream(request, onChunk) — calls onChunk(delta) for each token
 *   chunk as it arrives, then resolves with the full concatenated string.
 *   Falls back through the provider order exactly like complete().
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type {
  CompletionRequest,
  CompletionResponse,
  ModelProvider,
  ModelRouterConfig,
} from './types.js';

/** Callback invoked incrementally with each token delta during streaming. */
export type StreamChunkHandler = (delta: string) => void;

const DEFAULTS = {
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.2',
  anthropicModel: 'claude-3-5-haiku-20241022',
  openaiModel: 'gpt-4o-mini',
  providerOrder: ['ollama', 'anthropic', 'openai'] as ModelProvider[],
} as const;

export class ModelRouter {
  private config: Required<ModelRouterConfig>;

  constructor(config: ModelRouterConfig = {}) {
    this.config = {
      ollamaBaseUrl: config.ollamaBaseUrl ?? DEFAULTS.ollamaBaseUrl,
      ollamaModel: config.ollamaModel ?? DEFAULTS.ollamaModel,
      anthropicApiKey: config.anthropicApiKey ?? '',
      anthropicModel: config.anthropicModel ?? DEFAULTS.anthropicModel,
      openaiApiKey: config.openaiApiKey ?? '',
      openaiModel: config.openaiModel ?? DEFAULTS.openaiModel,
      providerOrder: config.providerOrder ?? [...DEFAULTS.providerOrder],
    };
  }

  /**
   * Complete a prompt using the configured provider priority.
   * Returns the text content directly (convenience wrapper).
   */
  async complete(request: CompletionRequest): Promise<string> {
    const result = await this.completeWithMeta(request);
    return result.content;
  }

  /**
   * Complete with full metadata about which provider was used.
   */
  async completeWithMeta(request: CompletionRequest): Promise<CompletionResponse> {
    const order = this.config.providerOrder;
    const errors: Array<{ provider: ModelProvider; error: string }> = [];
    let firstAttempt = true;

    for (const provider of order) {
      if (!this.isProviderAvailable(provider)) continue;

      try {
        const result = await this.callProvider(provider, request);
        return {
          ...result,
          usedFallback: !firstAttempt,
        };
      } catch (err) {
        errors.push({
          provider,
          error: err instanceof Error ? err.message : String(err),
        });
        firstAttempt = false;
      }
    }

    throw new Error(
      `All model providers failed:\n${errors
        .map((e) => `  ${e.provider}: ${e.error}`)
        .join('\n')}`
    );
  }

  // ── Streaming ────────────────────────────────────────────────────────────

  /**
   * Stream a completion, calling `onChunk(delta)` for each token fragment as
   * it arrives.  Falls through the provider order identically to complete().
   * Returns the full concatenated response string once the stream ends.
   *
   * If a provider doesn't support streaming (should not happen in practice)
   * the full response is delivered as a single chunk for graceful degradation.
   */
  async completeStream(
    request: CompletionRequest,
    onChunk: StreamChunkHandler,
  ): Promise<string> {
    const order = this.config.providerOrder;
    const errors: Array<{ provider: ModelProvider; error: string }> = [];

    for (const provider of order) {
      if (!this.isProviderAvailable(provider)) continue;

      try {
        return await this.callProviderStream(provider, request, onChunk);
      } catch (err) {
        errors.push({
          provider,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    throw new Error(
      `All model providers failed (streaming):\n${errors
        .map((e) => `  ${e.provider}: ${e.error}`)
        .join('\n')}`,
    );
  }

  private async callProviderStream(
    provider: ModelProvider,
    request: CompletionRequest,
    onChunk: StreamChunkHandler,
  ): Promise<string> {
    switch (provider) {
      case 'ollama':
        return this.callOllamaStream(request, onChunk);
      case 'anthropic':
        return this.callAnthropicStream(request, onChunk);
      case 'openai':
        return this.callOpenAIStream(request, onChunk);
    }
  }

  // ── Ollama streaming ─────────────────────────────────────────────────────

  private async callOllamaStream(
    request: CompletionRequest,
    onChunk: StreamChunkHandler,
  ): Promise<string> {
    const model = request.model ?? this.config.ollamaModel;
    const url = `${this.config.ollamaBaseUrl}/api/chat`;
    const messages = this.buildMessages(request);

    const body = {
      model,
      messages,
      stream: true, // ← key difference from non-streaming callOllama
      options: {
        temperature: request.temperature ?? 0.7,
        num_predict: request.maxTokens ?? 2048,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Ollama HTTP ${response.status}: ${text}`);
    }

    if (!response.body) {
      throw new Error('Ollama returned no response body for streaming request');
    }

    // Ollama streams NDJSON — one JSON object per line, terminated with
    // {"done":true,...}.  We read the body as a text stream line-by-line.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process all complete lines in the buffer
      const lines = buffer.split('\n');
      // Keep the last (potentially incomplete) fragment in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let parsed: { message?: { content?: string }; done?: boolean; error?: string };
        try {
          parsed = JSON.parse(trimmed) as typeof parsed;
        } catch {
          // Malformed line — skip
          continue;
        }

        if (parsed.error) throw new Error(`Ollama error: ${parsed.error}`);

        const delta = parsed.message?.content ?? '';
        if (delta) {
          full += delta;
          onChunk(delta);
        }

        if (parsed.done) break;
      }
    }

    // Flush any remaining buffer content
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer.trim()) as {
          message?: { content?: string };
          error?: string;
        };
        if (parsed.error) throw new Error(`Ollama error: ${parsed.error}`);
        const delta = parsed.message?.content ?? '';
        if (delta) {
          full += delta;
          onChunk(delta);
        }
      } catch {
        // Ignore incomplete trailing JSON
      }
    }

    return full;
  }

  // ── Anthropic streaming ──────────────────────────────────────────────────

  private async callAnthropicStream(
    request: CompletionRequest,
    onChunk: StreamChunkHandler,
  ): Promise<string> {
    const model = request.model ?? this.config.anthropicModel;
    const client = new Anthropic({ apiKey: this.config.anthropicApiKey });

    const messages = this.buildMessages(request).filter(
      (m) => m.role !== 'system',
    ) as Array<{ role: 'user' | 'assistant'; content: string }>;

    let full = '';

    // Anthropic SDK provides a convenient stream() helper that handles SSE
    const stream = client.messages.stream({
      model,
      max_tokens: request.maxTokens ?? 2048,
      system: request.system,
      messages,
    });

    // text(delta, snapshot) fires for every text_delta event
    stream.on('text', (delta: string) => {
      if (delta) {
        full += delta;
        onChunk(delta);
      }
    });

    // Wait for the stream to fully complete before returning
    await stream.finalMessage();

    return full;
  }

  // ── OpenAI streaming ─────────────────────────────────────────────────────

  private async callOpenAIStream(
    request: CompletionRequest,
    onChunk: StreamChunkHandler,
  ): Promise<string> {
    const model = request.model ?? this.config.openaiModel;
    const client = new OpenAI({ apiKey: this.config.openaiApiKey });
    const messages = this.buildMessages(request);

    let full = '';

    const stream = await client.chat.completions.create({
      model,
      max_tokens: request.maxTokens ?? 2048,
      temperature: request.temperature ?? 0.7,
      messages,
      stream: true, // ← enables streaming
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      if (delta) {
        full += delta;
        onChunk(delta);
      }
    }

    return full;
  }

  // ─────────────────────────────────────────────────────────────────────────

  private isProviderAvailable(provider: ModelProvider): boolean {
    switch (provider) {
      case 'ollama':
        return true; // Always try; will fail fast if not running
      case 'anthropic':
        return Boolean(this.config.anthropicApiKey);
      case 'openai':
        return Boolean(this.config.openaiApiKey);
    }
  }

  private async callProvider(
    provider: ModelProvider,
    request: CompletionRequest
  ): Promise<Omit<CompletionResponse, 'usedFallback'>> {
    switch (provider) {
      case 'ollama':
        return this.callOllama(request);
      case 'anthropic':
        return this.callAnthropic(request);
      case 'openai':
        return this.callOpenAI(request);
    }
  }

  // ── Ollama ───────────────────────────────────────────────────────────────

  private async callOllama(
    request: CompletionRequest
  ): Promise<Omit<CompletionResponse, 'usedFallback'>> {
    const model = request.model ?? this.config.ollamaModel;

    // Build prompt — Ollama's /api/generate uses a single prompt string
    // unless using the chat endpoint. We use the chat endpoint for consistency.
    const url = `${this.config.ollamaBaseUrl}/api/chat`;

    const messages = this.buildMessages(request);

    const body = {
      model,
      messages,
      stream: false,
      options: {
        temperature: request.temperature ?? 0.7,
        num_predict: request.maxTokens ?? 2048,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Ollama HTTP ${response.status}: ${text}`);
    }

    const data = (await response.json()) as {
      message?: { content?: string };
      error?: string;
    };

    if (data.error) throw new Error(`Ollama error: ${data.error}`);

    const content = data.message?.content ?? '';
    return { content, provider: 'ollama', model };
  }

  // ── Anthropic ────────────────────────────────────────────────────────────

  private async callAnthropic(
    request: CompletionRequest
  ): Promise<Omit<CompletionResponse, 'usedFallback'>> {
    const model = request.model ?? this.config.anthropicModel;
    const client = new Anthropic({ apiKey: this.config.anthropicApiKey });

    const messages = this.buildMessages(request).filter(
      (m) => m.role !== 'system'
    ) as Array<{ role: 'user' | 'assistant'; content: string }>;

    const response = await client.messages.create({
      model,
      max_tokens: request.maxTokens ?? 2048,
      system: request.system,
      messages,
    });

    const content =
      response.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text)
        .join('') ?? '';

    return { content, provider: 'anthropic', model };
  }

  // ── OpenAI ───────────────────────────────────────────────────────────────

  private async callOpenAI(
    request: CompletionRequest
  ): Promise<Omit<CompletionResponse, 'usedFallback'>> {
    const model = request.model ?? this.config.openaiModel;
    const client = new OpenAI({ apiKey: this.config.openaiApiKey });

    const messages = this.buildMessages(request);

    const response = await client.chat.completions.create({
      model,
      max_tokens: request.maxTokens ?? 2048,
      temperature: request.temperature ?? 0.7,
      messages,
    });

    const content = response.choices[0]?.message.content ?? '';
    return { content, provider: 'openai', model };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private buildMessages(
    request: CompletionRequest
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }> = [];

    if (request.system) {
      messages.push({ role: 'system', content: request.system });
    }

    for (const m of request.messages) {
      messages.push({ role: m.role as 'system' | 'user' | 'assistant', content: m.content });
    }

    return messages;
  }

  /** Check which providers are currently configured/available */
  getAvailableProviders(): ModelProvider[] {
    return this.config.providerOrder.filter((p) =>
      this.isProviderAvailable(p)
    );
  }

  /** Update config (e.g. after loading fresh keys from disk) */
  updateConfig(updates: Partial<ModelRouterConfig>): void {
    Object.assign(this.config, updates);
  }
}
