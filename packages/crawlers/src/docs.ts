/**
 * Docs crawler.
 *
 * Reads the README and any markdown files inside a `docs/` directory (or
 * custom directories) and converts them to `KBEntry` objects in the `Code`
 * category.
 *
 * Each markdown file becomes one KB entry whose content is the file body.
 * Files larger than MAX_CONTENT_CHARS are trimmed and annotated.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { KBEntry } from '@switchboard/core';
import { slugify } from '@switchboard/core';
import type { CrawlResult } from './types.js';

// ── Constants ─────────────────────────────────────────────────────────────

/** Maximum characters to store from a single doc file */
const MAX_CONTENT_CHARS = 8_000;

/** File extensions we treat as markdown */
const MARKDOWN_EXTENSIONS = new Set(['.md', '.mdx', '.markdown']);

// ── Helpers ───────────────────────────────────────────────────────────────

async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

async function statSafe(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Recursively collect all markdown files under `dir`.
 * Skips `node_modules`, `.git`, and hidden directories.
 */
async function collectMarkdownFiles(dir: string, maxDepth = 4, depth = 0): Promise<string[]> {
  if (depth > maxDepth) return [];

  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip noise directories
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }
      const nested = await collectMarkdownFiles(fullPath, maxDepth, depth + 1);
      files.push(...nested);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (MARKDOWN_EXTENSIONS.has(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Extract the first heading from markdown as the title, falling back to
 * the file basename (without extension).
 */
function extractTitle(content: string, fallback: string): string {
  const match = content.match(/^#{1,3}\s+(.+)$/m);
  return match ? match[1]!.trim() : fallback;
}

function buildEntry(
  filePath: string,
  repoPath: string,
  rawContent: string
): KBEntry {
  const basename = path.basename(filePath, path.extname(filePath));
  const relPath = path.relative(repoPath, filePath);

  let content = rawContent;
  let truncated = false;
  if (content.length > MAX_CONTENT_CHARS) {
    content = content.slice(0, MAX_CONTENT_CHARS);
    truncated = true;
    // Try not to cut mid-line
    const lastNewline = content.lastIndexOf('\n');
    if (lastNewline > MAX_CONTENT_CHARS * 0.8) {
      content = content.slice(0, lastNewline);
    }
  }

  if (truncated) {
    content += `\n\n> ⚠️ _Content truncated at ${MAX_CONTENT_CHARS} characters. See \`${relPath}\` for the full file._`;
  }

  const title = extractTitle(rawContent, basename);
  const id = slugify(`${path.basename(repoPath)}-${relPath.replace(/[/\\]/g, '-')}`);

  return {
    id,
    category: 'Code',
    title,
    content,
    source: `docs:${repoPath}:${relPath}`,
    createdAt: new Date().toISOString(),
    tags: ['auto-crawled', 'docs', 'markdown'],
  };
}

// ── Public API ────────────────────────────────────────────────────────────

export interface CrawlDocsOptions {
  /**
   * Additional directories (relative to `repoPath`) to scan for markdown.
   * Default scan list: `['docs', 'documentation', 'wiki', '.github']`
   */
  extraDirs?: string[];
  /**
   * Set to true to skip the root README.md.
   * @default false
   */
  skipReadme?: boolean;
  /**
   * Maximum recursion depth inside `docs/` directories.
   * @default 4
   */
  maxDepth?: number;
}

/**
 * Crawl documentation from `repoPath` and return KB entries in the `Code`
 * category.
 *
 * Files crawled:
 *   1. `README.md` (and README.mdx / README.markdown) at the repo root
 *   2. All markdown files under `docs/`, `documentation/`, `wiki/`,
 *      `.github/`, and any `extraDirs` supplied by the caller
 */
export async function crawlDocs(
  repoPath: string,
  options: CrawlDocsOptions = {}
): Promise<CrawlResult> {
  const { extraDirs = [], skipReadme = false, maxDepth = 4 } = options;

  const entries: KBEntry[] = [];
  const seen = new Set<string>(); // avoid duplicates by canonical path

  // ── 1. Root README ─────────────────────────────────────────────────────
  if (!skipReadme) {
    for (const readmeName of ['README.md', 'README.mdx', 'README.markdown', 'Readme.md']) {
      const readmePath = path.join(repoPath, readmeName);
      if (await statSafe(readmePath)) {
        const raw = await readFileSafe(readmePath);
        if (raw) {
          const canonical = path.resolve(readmePath);
          if (!seen.has(canonical)) {
            seen.add(canonical);
            entries.push(buildEntry(readmePath, repoPath, raw));
          }
        }
        break; // stop at first found
      }
    }
  }

  // ── 2. Docs directories ────────────────────────────────────────────────
  const docsDirs = [
    'docs',
    'documentation',
    'wiki',
    '.github',
    ...extraDirs,
  ];

  for (const dir of docsDirs) {
    const docsPath = path.join(repoPath, dir);
    if (!(await statSafe(docsPath))) continue;

    const mdFiles = await collectMarkdownFiles(docsPath, maxDepth);
    for (const filePath of mdFiles) {
      const canonical = path.resolve(filePath);
      if (seen.has(canonical)) continue;
      seen.add(canonical);

      const raw = await readFileSafe(filePath);
      if (!raw) continue;

      entries.push(buildEntry(filePath, repoPath, raw));
    }
  }

  return {
    entries,
    source: 'docs',
    repoPath,
    crawledAt: new Date(),
  };
}
