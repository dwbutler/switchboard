/**
 * Workspace scaffold — creates .switchboard/ directory structure for a new workspace.
 * Called during `switchboard init` or on first-run.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  agentsMdTemplate,
  kbReadmeTemplate,
  memoryMdTemplate,
  openclawJsonTemplate,
} from './templates.js';

export interface ScaffoldOptions {
  /** Absolute path to the workspace root (where .switchboard/ will be created) */
  workspaceRoot: string;
  /** Human-readable name for this workspace */
  workspaceName?: string;
  /** If true, overwrite existing files. Default: false (skip existing) */
  overwrite?: boolean;
}

export interface ScaffoldResult {
  workspaceRoot: string;
  switchboardDir: string;
  /** Files that were created */
  created: string[];
  /** Files that were skipped (already existed and overwrite=false) */
  skipped: string[];
}

const KB_CATEGORIES = ['Code', 'Infra', 'Decisions', 'People'] as const;

/**
 * Scaffold a .switchboard/ workspace directory.
 * Safe to call multiple times — skips existing files unless overwrite=true.
 */
export async function scaffoldWorkspace(
  options: ScaffoldOptions
): Promise<ScaffoldResult> {
  const { workspaceRoot, overwrite = false } = options;
  const workspaceName =
    options.workspaceName ?? path.basename(workspaceRoot);

  const switchboardDir = path.join(workspaceRoot, '.switchboard');
  const kbDir = path.join(switchboardDir, 'knowledge-base');
  const memoryDir = path.join(switchboardDir, 'memory');

  const created: string[] = [];
  const skipped: string[] = [];

  // Helper: write a file, respecting overwrite flag
  async function writeFile(filePath: string, content: string): Promise<void> {
    if (!overwrite) {
      try {
        await fs.access(filePath);
        skipped.push(filePath);
        return;
      } catch {
        // File doesn't exist — proceed to create
      }
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
    created.push(filePath);
  }

  // Helper: ensure a directory exists
  async function ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  // ── Directory structure ──────────────────────────────────────────────────

  await ensureDir(switchboardDir);
  await ensureDir(kbDir);
  await ensureDir(memoryDir);

  for (const cat of KB_CATEGORIES) {
    await ensureDir(path.join(kbDir, cat));
    // Write a .gitkeep so empty dirs are tracked
    await writeFile(path.join(kbDir, cat, '.gitkeep'), '');
  }

  // ── Core files ───────────────────────────────────────────────────────────

  await writeFile(
    path.join(switchboardDir, 'AGENTS.md'),
    agentsMdTemplate(workspaceName, workspaceRoot)
  );

  await writeFile(
    path.join(switchboardDir, 'MEMORY.md'),
    memoryMdTemplate(workspaceName)
  );

  await writeFile(
    path.join(kbDir, 'README.md'),
    kbReadmeTemplate()
  );

  await writeFile(
    path.join(switchboardDir, 'openclaw.json.template'),
    openclawJsonTemplate(workspaceName, workspaceRoot)
  );

  // ── .gitignore entry for secrets ─────────────────────────────────────────
  const gitignorePath = path.join(switchboardDir, '.gitignore');
  await writeFile(
    gitignorePath,
    [
      '# Switchboard workspace — do not commit secrets',
      'config.json',
      'openclaw.json',
      'memory/',
      '*.key',
      '*.secret',
      '',
    ].join('\n')
  );

  return {
    workspaceRoot,
    switchboardDir,
    created,
    skipped,
  };
}

/**
 * Check if a workspace has already been scaffolded.
 */
export async function isWorkspaceScaffolded(workspaceRoot: string): Promise<boolean> {
  const agentsPath = path.join(workspaceRoot, '.switchboard', 'AGENTS.md');
  try {
    await fs.access(agentsPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the .switchboard dir for a workspace, throwing if it doesn't exist.
 */
export function getSwitchboardWorkspaceDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.switchboard');
}
