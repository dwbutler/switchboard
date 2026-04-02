/**
 * Knowledge Base types for Switchboard.
 * The KB is a per-workspace structured memory store written to
 * .switchboard/knowledge-base/{category}/ as markdown files.
 */

export type KBCategory = 'Code' | 'Infra' | 'Decisions' | 'People';

export interface KBEntry {
  /** Stable slug — derived from title, e.g. "auth-flow" */
  id: string;
  category: KBCategory;
  title: string;
  /** Markdown body */
  content: string;
  /** Where this entry came from — chat session, manual, audit, etc. */
  source: string;
  createdAt: string; // ISO 8601
  updatedAt?: string; // ISO 8601
  /** Optional tags for cross-referencing */
  tags?: string[];
}

export interface KBWriteResult {
  entry: KBEntry;
  /** Absolute path to the written file */
  filePath: string;
  /** Whether the file was newly created (true) or updated (false) */
  created: boolean;
}

export interface KBSearchResult {
  entry: KBEntry;
  filePath: string;
  /** Simple relevance score 0–1 based on keyword overlap */
  score: number;
}
