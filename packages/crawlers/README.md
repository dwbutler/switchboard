# @switchboard/crawlers

Repository crawlers that ingest source data into the [Switchboard](../../README.md) Knowledge Base.

## Crawlers

| Crawler | Function | Output category | Source |
|---------|----------|-----------------|--------|
| Git log | `crawlGit(repoPath, opts?)` | `Decisions` | `simple-git` |
| Dependencies | `crawlDeps(repoPath, opts?)` | `Infra` | File system |
| Docs | `crawlDocs(repoPath, opts?)` | `Code` | File system |
| GitHub API | `crawlGitHub(owner, repo, opts?)` | `Code` + `Decisions` | `@octokit/rest` |

## Usage

```ts
import { crawlGit, crawlDeps, crawlDocs, crawlGitHub } from '@switchboard/crawlers';
import { KBWriter } from '@switchboard/core';

const writer = new KBWriter('/path/to/.switchboard');

// 1. Git history → Decisions entries
const { entries: gitEntries } = await crawlGit('/path/to/repo');
for (const e of gitEntries) await writer.write(e);

// 2. Dependency manifests → Infra entries
const { entries: depEntries } = await crawlDeps('/path/to/repo');
for (const e of depEntries) await writer.write(e);

// 3. README + docs/ → Code entries
const { entries: docEntries } = await crawlDocs('/path/to/repo');
for (const e of docEntries) await writer.write(e);

// 4. GitHub API → Code + Decisions entries
const { entries: ghEntries } = await crawlGitHub('my-org', 'my-repo', {
  token: process.env.GITHUB_TOKEN,
});
for (const e of ghEntries) await writer.write(e);
```

## Crawler Details

### `crawlGit`

Walks `git log --all` and captures:
- Commits matching ADR patterns (`[ADR]`, `decide:`, `decision:`, etc.)
- Conventional commits with a meaningful body (≥ 40 chars of rationale)

Options:
```ts
{
  maxCommits?: number;             // default: 500
  captureAllConventional?: boolean; // default: false
}
```

### `crawlDeps`

Reads the following manifests from the repo root:
- `package.json` (Node.js)
- `Gemfile` (Ruby)
- `Cargo.toml` (Rust)
- `requirements.txt` (Python/pip)
- `pyproject.toml` (Python/Poetry)
- `go.mod` (Go)
- `composer.json` (PHP)

### `crawlDocs`

Scans for markdown files in:
- Root `README.md`
- `docs/`, `documentation/`, `wiki/`, `.github/`
- Any additional directories via `extraDirs`

Files larger than 8 000 characters are truncated with a note.

### `crawlGitHub`

Fetches via the GitHub REST API:
1. Repository metadata (description, language, topics, stars)
2. Issues labelled with decision-related labels (`adr`, `decision`, `architecture`, `rfc`)
3. Releases with release notes

Requires a GitHub token via the `token` option or `GITHUB_TOKEN` env var.

## CrawlResult

Every crawler returns a `CrawlResult`:

```ts
interface CrawlResult {
  entries: KBEntry[];     // ready to persist via KBWriter
  source: CrawlSource;    // 'git' | 'github' | 'deps' | 'docs'
  repoPath: string;       // absolute path or "owner/repo"
  crawledAt: Date;
}
```
