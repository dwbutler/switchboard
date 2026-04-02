/**
 * @switchboard/crawlers — barrel export
 *
 * Provides crawlers that ingest repository data into the Switchboard
 * Knowledge Base:
 *
 *   - `crawlGit`    — git log → Decisions entries (ADRs, conventional commits)
 *   - `crawlDeps`   — dependency manifests → Infra entries
 *   - `crawlDocs`   — README + docs/ markdown → Code entries
 *   - `crawlGitHub` — GitHub API (repo, issues, releases) → KB entries
 *
 * All crawlers return a `CrawlResult` which can be persisted via
 * `@switchboard/core`'s `KBWriter`.
 *
 * @example
 * ```ts
 * import { crawlGit, crawlDeps, crawlDocs } from '@switchboard/crawlers';
 * import { KBWriter } from '@switchboard/core';
 *
 * const writer = new KBWriter('/path/to/workspace');
 * const { entries } = await crawlGit('/path/to/repo');
 * for (const entry of entries) await writer.write(entry);
 * ```
 */

// ── Crawlers ──────────────────────────────────────────────────────────────
export { crawlGit } from './git.js';
export type { CrawlGitOptions } from './git.js';

export { crawlDeps } from './deps.js';
export type { CrawlDepsOptions } from './deps.js';

export { crawlDocs } from './docs.js';
export type { CrawlDocsOptions } from './docs.js';

export { crawlGitHub } from './github.js';
export type { CrawlGitHubOptions } from './github.js';

// ── Shared types ──────────────────────────────────────────────────────────
export type { CrawlResult, CrawlSource } from './types.js';
