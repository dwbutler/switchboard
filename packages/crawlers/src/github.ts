/**
 * GitHub API crawler.
 *
 * Uses @octokit/rest to pull repository metadata, issues labelled as
 * decisions/ADRs, releases, and top-level topics from the GitHub API,
 * converting them into KB entries across the relevant categories.
 *
 * Requires a `GITHUB_TOKEN` (or caller-supplied token) for authenticated
 * requests; falls back to unauthenticated (lower rate limit).
 */

import { Octokit } from '@octokit/rest';
import type { KBEntry } from '@switchboard/core';
import { slugify } from '@switchboard/core';
import type { CrawlResult } from './types.js';

// ── Types ─────────────────────────────────────────────────────────────────

export interface CrawlGitHubOptions {
  /**
   * GitHub personal access token.
   * Falls back to `process.env.GITHUB_TOKEN` if not provided.
   */
  token?: string;

  /**
   * Labels that indicate a decision/ADR issue.
   * @default ['adr', 'decision', 'architecture', 'rfc']
   */
  decisionLabels?: string[];

  /**
   * Maximum number of issues to fetch.
   * @default 100
   */
  maxIssues?: number;

  /**
   * Maximum number of releases to fetch.
   * @default 20
   */
  maxReleases?: number;

  /**
   * If true, also crawl open issues (not just closed decisions).
   * @default false
   */
  includeOpenIssues?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function repoId(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}

// ── Builders ──────────────────────────────────────────────────────────────

function buildRepoOverviewEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  repoData: any,
  owner: string,
  repo: string
): KBEntry {
  const topics: string[] = repoData.topics ?? [];
  const topicsLine =
    topics.length > 0 ? `\n**Topics:** ${topics.map((t: string) => `\`${t}\``).join(', ')}` : '';

  const content = [
    `**Repository:** [${owner}/${repo}](${repoData.html_url as string})`,
    `**Description:** ${(repoData.description as string | null) ?? '_none_'}`,
    `**Language:** ${(repoData.language as string | null) ?? '_unknown_'}`,
    `**Stars:** ${repoData.stargazers_count as number}  **Forks:** ${repoData.forks_count as number}  **Open issues:** ${repoData.open_issues_count as number}`,
    `**Default branch:** \`${repoData.default_branch as string}\``,
    topicsLine,
    `**Visibility:** ${repoData.private ? 'private' : 'public'}`,
    `**Created:** ${repoData.created_at as string}  **Updated:** ${repoData.updated_at as string}`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    id: slugify(`github-repo-${owner}-${repo}`),
    category: 'Code',
    title: `GitHub repo: ${owner}/${repo}`,
    content,
    source: `github:${owner}/${repo}`,
    createdAt: new Date().toISOString(),
    tags: ['github', 'repo-metadata', 'auto-crawled'],
  };
}

function buildIssueEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  issue: any,
  owner: string,
  repo: string
): KBEntry {
  const labels: string[] = (issue.labels ?? []).map((l: { name: string }) => l.name);
  const body: string = (issue.body as string | null) ?? '_No description provided._';

  // Trim very long bodies
  const trimmedBody = body.length > 6000 ? body.slice(0, 6000) + '\n\n> _(truncated)_' : body;

  const content = [
    `**Issue #${issue.number as number}:** [${issue.title as string}](${issue.html_url as string})`,
    `**State:** ${issue.state as string}  **Labels:** ${labels.map((l) => `\`${l}\``).join(', ') || '_none_'}`,
    `**Opened by:** ${(issue.user as { login: string }).login}  **Created:** ${issue.created_at as string}`,
    issue.closed_at
      ? `**Closed:** ${issue.closed_at as string}`
      : '',
    '',
    trimmedBody,
  ]
    .filter((l) => l !== undefined)
    .join('\n');

  return {
    id: slugify(`github-issue-${owner}-${repo}-${issue.number as number}`),
    category: 'Decisions',
    title: `[#${issue.number as number}] ${issue.title as string}`,
    content,
    source: `github:${owner}/${repo}`,
    createdAt: new Date(issue.created_at as string).toISOString(),
    tags: ['github', 'issue', 'auto-crawled', ...labels],
  };
}

function buildReleaseEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  release: any,
  owner: string,
  repo: string
): KBEntry {
  const body: string = (release.body as string | null) ?? '_No release notes._';
  const trimmedBody = body.length > 4000 ? body.slice(0, 4000) + '\n\n> _(truncated)_' : body;

  const content = [
    `**Release:** [${release.tag_name as string}](${release.html_url as string})`,
    `**Name:** ${(release.name as string | null) ?? release.tag_name as string}`,
    `**Published:** ${release.published_at as string}`,
    release.prerelease ? '**Pre-release:** yes' : '',
    '',
    trimmedBody,
  ]
    .filter((l) => l !== undefined)
    .join('\n');

  return {
    id: slugify(`github-release-${owner}-${repo}-${release.tag_name as string}`),
    category: 'Decisions',
    title: `Release ${release.tag_name as string} — ${owner}/${repo}`,
    content,
    source: `github:${owner}/${repo}`,
    createdAt: new Date(release.published_at as string).toISOString(),
    tags: ['github', 'release', 'auto-crawled'],
  };
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Crawl a GitHub repository via the REST API and return KB entries.
 *
 * @param owner  GitHub org or user, e.g. `"unitypeaceproject"`
 * @param repo   Repository name, e.g. `"switchboard"`
 * @param options  See {@link CrawlGitHubOptions}
 */
export async function crawlGitHub(
  owner: string,
  repo: string,
  options: CrawlGitHubOptions = {}
): Promise<CrawlResult> {
  const {
    token = process.env['GITHUB_TOKEN'],
    decisionLabels = ['adr', 'decision', 'architecture', 'rfc'],
    maxIssues = 100,
    maxReleases = 20,
    includeOpenIssues = false,
  } = options;

  const octokit = new Octokit({ auth: token });
  const entries: KBEntry[] = [];
  const path = repoId(owner, repo);

  // ── 1. Repo overview ──────────────────────────────────────────────────
  try {
    const { data: repoData } = await octokit.repos.get({ owner, repo });
    entries.push(buildRepoOverviewEntry(repoData, owner, repo));
  } catch (err) {
    // If we can't fetch the repo at all, bail early
    console.error(`[crawlGitHub] Failed to fetch repo ${path}:`, err);
    return { entries: [], source: 'github', repoPath: path, crawledAt: new Date() };
  }

  // ── 2. Decision/ADR issues ────────────────────────────────────────────
  try {
    const labelQuery = decisionLabels.join(',');
    const issueState = includeOpenIssues ? 'all' : 'closed';

    const { data: issues } = await octokit.issues.listForRepo({
      owner,
      repo,
      labels: labelQuery,
      state: issueState,
      per_page: Math.min(maxIssues, 100),
      sort: 'created',
      direction: 'desc',
    });

    for (const issue of issues) {
      // Skip pull requests (GitHub returns PRs in the issues list)
      if (issue.pull_request) continue;
      entries.push(buildIssueEntry(issue, owner, repo));
    }
  } catch {
    // Label doesn't exist or API error — not fatal
  }

  // ── 3. Releases ───────────────────────────────────────────────────────
  try {
    const { data: releases } = await octokit.repos.listReleases({
      owner,
      repo,
      per_page: Math.min(maxReleases, 100),
    });

    for (const release of releases) {
      entries.push(buildReleaseEntry(release, owner, repo));
    }
  } catch {
    // Releases API unavailable — not fatal
  }

  return {
    entries,
    source: 'github',
    repoPath: path,
    crawledAt: new Date(),
  };
}
