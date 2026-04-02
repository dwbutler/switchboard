/**
 * KB Writer — persists KBEntry objects to disk as markdown files.
 * Files live at: {workspaceRoot}/.switchboard/knowledge-base/{category}/{id}.md
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { KBCategory, KBEntry, KBWriteResult } from './types.js';

/** Convert a title to a stable file-system slug */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Render a KBEntry as a markdown string with YAML frontmatter */
function renderMarkdown(entry: KBEntry): string {
  const tags =
    entry.tags && entry.tags.length > 0
      ? `\ntags: [${entry.tags.map((t) => `"${t}"`).join(', ')}]`
      : '';
  const updatedAt = entry.updatedAt ? `\nupdatedAt: "${entry.updatedAt}"` : '';

  return `---
id: "${entry.id}"
category: "${entry.category}"
title: "${entry.title}"
source: "${entry.source}"
createdAt: "${entry.createdAt}"${updatedAt}${tags}
---

# ${entry.title}

${entry.content}
`.trimEnd() + '\n';
}

/** Parse a markdown string with frontmatter back into a KBEntry */
function parseMarkdown(raw: string, fallbackId: string): KBEntry {
  const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    throw new Error(`Invalid KB file format for entry: ${fallbackId}`);
  }

  const fm = frontmatterMatch[1]!;
  const body = frontmatterMatch[2]!.replace(/^# [^\n]+\n\n?/, '').trim();

  const get = (key: string): string => {
    const m = fm.match(new RegExp(`^${key}: "([^"]*)"`, 'm'));
    return m ? m[1]! : '';
  };

  const getOptional = (key: string): string | undefined => {
    const val = get(key);
    return val || undefined;
  };

  const tagsMatch = fm.match(/^tags: \[([^\]]*)\]/m);
  const tags = tagsMatch
    ? tagsMatch[1]!.split(',').map((t) => t.trim().replace(/^"|"$/g, ''))
    : undefined;

  return {
    id: get('id') || fallbackId,
    category: get('category') as KBCategory,
    title: get('title'),
    content: body,
    source: get('source'),
    createdAt: get('createdAt'),
    updatedAt: getOptional('updatedAt'),
    tags,
  };
}

/**
 * Resolve the output root for a provisioning session.
 *
 * In production (read-only FS), writes go to:
 *   $DROP_PATH/<sessionId>/
 *
 * In local dev, defaults to:
 *   ./drop/<sessionId>/
 *
 * The `drop/` directory is write-only in production — the agent cannot read
 * back what it writes there. Each session gets its own subdirectory so
 * concurrent provisioning jobs don't collide.
 */
export function resolveDropPath(sessionId: string): string {
  const base = process.env['DROP_PATH'] ?? './drop';
  return path.join(base, sessionId);
}

export class KBWriter {
  private kbRoot: string;

  /**
   * @param workspaceRoot - where to write the .switchboard/ tree.
   *   In production, pass `resolveDropPath(sessionId)`.
   *   In local dev, pass any writable directory (or omit to use DROP_PATH default).
   */
  constructor(workspaceRoot: string) {
    this.kbRoot = path.join(workspaceRoot, '.switchboard', 'knowledge-base');
  }

  private categoryDir(category: KBCategory): string {
    return path.join(this.kbRoot, category);
  }

  private entryPath(entry: Pick<KBEntry, 'category' | 'id'>): string {
    return path.join(this.categoryDir(entry.category), `${entry.id}.md`);
  }

  /** Write (create or update) a KB entry to disk */
  async write(entry: KBEntry): Promise<KBWriteResult> {
    const dir = this.categoryDir(entry.category);
    await fs.mkdir(dir, { recursive: true });

    const filePath = this.entryPath(entry);
    let created = true;

    try {
      await fs.access(filePath);
      // File exists — this is an update
      created = false;
      entry = { ...entry, updatedAt: new Date().toISOString() };
    } catch {
      // File doesn't exist — new entry
      if (!entry.createdAt) {
        entry = { ...entry, createdAt: new Date().toISOString() };
      }
    }

    await fs.writeFile(filePath, renderMarkdown(entry), 'utf-8');
    return { entry, filePath, created };
  }

  /** Create a new entry from raw fields, auto-generating id and timestamps */
  async create(
    fields: Omit<KBEntry, 'id' | 'createdAt'> & {
      id?: string;
      createdAt?: string;
    }
  ): Promise<KBWriteResult> {
    const id = fields.id ?? slugify(fields.title);
    const createdAt = fields.createdAt ?? new Date().toISOString();
    return this.write({ ...fields, id, createdAt });
  }

  /** Read a single entry by category + id */
  async read(category: KBCategory, id: string): Promise<KBEntry | null> {
    const filePath = this.entryPath({ category, id });
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return parseMarkdown(raw, id);
    } catch {
      return null;
    }
  }

  /** List all entries in a category */
  async listCategory(category: KBCategory): Promise<KBEntry[]> {
    const dir = this.categoryDir(category);
    try {
      const files = await fs.readdir(dir);
      const entries: KBEntry[] = [];
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const raw = await fs.readFile(path.join(dir, file), 'utf-8');
        const id = file.replace(/\.md$/, '');
        try {
          entries.push(parseMarkdown(raw, id));
        } catch {
          // skip malformed files
        }
      }
      return entries;
    } catch {
      return [];
    }
  }

  /** List all entries across all categories */
  async listAll(): Promise<KBEntry[]> {
    const categories: KBCategory[] = ['Code', 'Infra', 'Decisions', 'People'];
    const results = await Promise.all(
      categories.map((c) => this.listCategory(c))
    );
    return results.flat();
  }

  /** Delete an entry from disk */
  async delete(category: KBCategory, id: string): Promise<boolean> {
    const filePath = this.entryPath({ category, id });
    try {
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
