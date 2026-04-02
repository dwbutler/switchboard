/**
 * KB Synthesizer — uses the model router to synthesize KB entries
 * from freeform conversation text or structured inputs.
 *
 * Given a block of text (e.g. a chat transcript or user description),
 * it extracts structured KB entries to persist.
 */

import type { KBCategory, KBEntry } from './types.js';
import { slugify } from './writer.js';
import type { ModelRouter } from '../model/router.js';

export interface SynthesisInput {
  /** Raw text to extract knowledge from */
  text: string;
  /** Hint about what category to focus on (optional) */
  categoryHint?: KBCategory;
  /** Where this knowledge came from */
  source: string;
}

export interface SynthesisResult {
  entries: Omit<KBEntry, 'id' | 'createdAt'>[];
  /** Raw model response for debugging */
  rawResponse: string;
}

const SYSTEM_PROMPT = `You are a knowledge extraction assistant. 
Extract factual, structured knowledge from the provided text and return it as JSON.
Categories: Code (code patterns, APIs, tech decisions), Infra (infrastructure, deployment, ops), 
Decisions (architectural or product decisions with rationale), People (people, teams, orgs).

Return ONLY valid JSON in this exact shape — no markdown fences, no commentary:
{
  "entries": [
    {
      "category": "Code" | "Infra" | "Decisions" | "People",
      "title": "Short descriptive title",
      "content": "Markdown content with the full knowledge",
      "tags": ["optional", "tags"]
    }
  ]
}

Rules:
- Only include genuinely useful, concrete facts — skip vague filler
- Prefer specificity over generality
- content should be markdown with headers/bullets where helpful
- If nothing worth capturing, return { "entries": [] }`;

export class KBSynthesizer {
  constructor(private router: ModelRouter) {}

  async synthesize(input: SynthesisInput): Promise<SynthesisResult> {
    const userMessage = input.categoryHint
      ? `Category hint: ${input.categoryHint}\n\nText to extract from:\n${input.text}`
      : `Text to extract from:\n${input.text}`;

    const rawResponse = await this.router.complete({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    let parsed: { entries: Array<Omit<KBEntry, 'id' | 'createdAt' | 'source'>> };
    try {
      // Strip any accidental markdown fences
      const cleaned = rawResponse
        .replace(/^```(?:json)?\n?/m, '')
        .replace(/\n?```$/m, '')
        .trim();
      parsed = JSON.parse(cleaned) as typeof parsed;
    } catch {
      parsed = { entries: [] };
    }

    const entries = (parsed.entries ?? []).map((e) => ({
      ...e,
      source: input.source,
    }));

    return { entries, rawResponse };
  }

  /**
   * Synthesize and return fully-formed KBEntry objects ready to write.
   * Caller is responsible for persisting via KBWriter.
   */
  async extractEntries(input: SynthesisInput): Promise<Omit<KBEntry, 'id' | 'createdAt'>[]> {
    const result = await this.synthesize(input);
    return result.entries;
  }

  /**
   * Summarize existing KB entries into a digest string.
   * Useful for injecting context into prompts.
   */
  async summarizeForContext(entries: KBEntry[]): Promise<string> {
    if (entries.length === 0) return '';

    const entrySummaries = entries
      .map((e) => `### ${e.category}: ${e.title}\n${e.content}`)
      .join('\n\n');

    return this.router.complete({
      system: `You are a technical writer. Summarize the following knowledge base entries into a concise 
3-5 sentence paragraph that captures the most important facts. Plain text only, no headers.`,
      messages: [{ role: 'user', content: entrySummaries }],
    });
  }

  /** Generate a slug-ready ID from a title using the same logic as the writer */
  generateId(title: string): string {
    return slugify(title);
  }
}
