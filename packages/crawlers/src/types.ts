/**
 * Shared types for @switchboard/crawlers.
 */

import type { KBEntry } from '@switchboard/core';

/** Which data source produced a CrawlResult */
export type CrawlSource = 'git' | 'github' | 'deps' | 'docs';

/**
 * The result returned by every crawler function.
 *
 * - `entries`   — KB entries ready to be persisted via KBWriter
 * - `source`    — which crawler produced the entries
 * - `repoPath`  — absolute path (or GitHub owner/repo) that was crawled
 * - `crawledAt` — timestamp of when the crawl ran
 */
export interface CrawlResult {
  entries: KBEntry[];
  source: CrawlSource;
  repoPath: string;
  crawledAt: Date;
}
