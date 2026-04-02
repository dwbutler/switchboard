/**
 * Git log crawler.
 *
 * Reads the full git history of a local repository and surfaces:
 *   - ADR-like commit messages (tagged with [ADR], "decide:", "decision:", etc.)
 *   - Conventional-commit "feat:" and "fix:" summaries
 *   - Any commit body that looks like a rationale paragraph (≥ 40 chars)
 *
 * Each matched commit becomes a `KBEntry` in the `Decisions` category.
 */

import { simpleGit } from 'simple-git';
import type { KBEntry } from '@switchboard/core';
import { slugify } from '@switchboard/core';
import type { CrawlResult } from './types.js';

// ── Patterns that indicate a decision/ADR worth capturing ────────────────

const ADR_PATTERNS: RegExp[] = [
  /\[ADR[- ]?\d*\]/i,
  /^adr[:\s]/i,
  /^decide[d]?[:\s]/i,
  /^decision[:\s]/i,
  /^chose[:\s]/i,
  /^switch(?:ed)?\s+(?:from|to)[:\s]/i,
  /\bdecid(?:ed|e)\b/i,
];

const INTERESTING_PREFIXES: RegExp[] = [
  /^feat(?:\(.+\))?!?:/i,
  /^fix(?:\(.+\))?!?:/i,
  /^refactor(?:\(.+\))?!?:/i,
  /^chore(?:\(.+\))?!?:/i,
  /^perf(?:\(.+\))?!?:/i,
  /^BREAKING CHANGE/,
];

/** Minimum body length (chars) to be considered a rationale paragraph */
const MIN_BODY_LENGTH = 40;

// ── Git log format ────────────────────────────────────────────────────────

/**
 * Each commit is serialised as:
 *   HASH|SUBJECT|BODY_LINE_1...
 * We use a unique delimiter to avoid collisions with commit text.
 */
const COMMIT_DELIMITER = '---COMMIT---';
const FIELD_DELIMITER = '|||';

interface RawCommit {
  hash: string;
  subject: string;
  body: string;
  date: string;
  author: string;
}

function isAdrLike(subject: string, body: string): boolean {
  for (const re of ADR_PATTERNS) {
    if (re.test(subject) || re.test(body)) return true;
  }
  return false;
}

function isInterestingConventional(subject: string): boolean {
  for (const re of INTERESTING_PREFIXES) {
    if (re.test(subject)) return true;
  }
  return false;
}

function hasRationaleBody(body: string): boolean {
  return body.trim().length >= MIN_BODY_LENGTH;
}

function buildEntry(commit: RawCommit, repoPath: string): KBEntry {
  const title = commit.subject.slice(0, 120); // cap title length
  const id = slugify(`${commit.hash.slice(0, 8)}-${title}`);

  const bodySection = commit.body.trim()
    ? `\n\n**Body:**\n\n${commit.body.trim()}`
    : '';

  const content = [
    `**Commit:** \`${commit.hash.slice(0, 8)}\`  `,
    `**Author:** ${commit.author}  `,
    `**Date:** ${commit.date}  `,
    `**Subject:** ${commit.subject}`,
    bodySection,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    id,
    category: 'Decisions',
    title,
    content,
    source: `git:${repoPath}`,
    createdAt: new Date(commit.date).toISOString(),
    tags: ['git-commit', 'auto-crawled'],
  };
}

// ── Public API ────────────────────────────────────────────────────────────

export interface CrawlGitOptions {
  /** Maximum number of commits to inspect (default: 500) */
  maxCommits?: number;
  /** If true, capture ALL conventional commits, not just ADR-like ones */
  captureAllConventional?: boolean;
}

/**
 * Crawl the git history at `repoPath` and return interesting commits
 * as KB entries in the `Decisions` category.
 */
export async function crawlGit(
  repoPath: string,
  options: CrawlGitOptions = {}
): Promise<CrawlResult> {
  const { maxCommits = 500, captureAllConventional = false } = options;

  const git = simpleGit(repoPath);

  // Verify this is actually a git repo
  const isRepo = await git.checkIsRepo();
  if (!isRepo) {
    return {
      entries: [],
      source: 'git',
      repoPath,
      crawledAt: new Date(),
    };
  }

  // Fetch full log with hash, author date, author name, subject, body
  // %x00 = NUL byte used as field separator to avoid collisions
  const logResult = await git.raw([
    'log',
    '--all',
    `--max-count=${maxCommits}`,
    `--format=%H${FIELD_DELIMITER}%aI${FIELD_DELIMITER}%aN${FIELD_DELIMITER}%s${FIELD_DELIMITER}%b${COMMIT_DELIMITER}`,
  ]);

  const rawCommits: RawCommit[] = logResult
    .split(COMMIT_DELIMITER)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const parts = block.split(FIELD_DELIMITER);
      return {
        hash: (parts[0] ?? '').trim(),
        date: (parts[1] ?? '').trim(),
        author: (parts[2] ?? '').trim(),
        subject: (parts[3] ?? '').trim(),
        body: (parts[4] ?? '').trim(),
      };
    })
    .filter((c) => c.hash.length > 0);

  const entries: KBEntry[] = [];

  for (const commit of rawCommits) {
    const isAdr = isAdrLike(commit.subject, commit.body);
    const isConventional = isInterestingConventional(commit.subject);
    const hasRationale = hasRationaleBody(commit.body);

    if (isAdr || (captureAllConventional && isConventional) || hasRationale) {
      entries.push(buildEntry(commit, repoPath));
    }
  }

  return {
    entries,
    source: 'git',
    repoPath,
    crawledAt: new Date(),
  };
}
