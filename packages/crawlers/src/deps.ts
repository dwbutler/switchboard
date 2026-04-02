/**
 * Dependency crawler.
 *
 * Reads known dependency manifests from a repo root and converts them into
 * `KBEntry` objects in the `Infra` category.  This gives the KB a snapshot
 * of a project's tech stack that can be queried later.
 *
 * Supported manifests:
 *   - package.json          (Node / npm / pnpm / yarn)
 *   - Gemfile               (Ruby / Bundler)
 *   - Cargo.toml            (Rust / Cargo)
 *   - requirements.txt      (Python / pip)
 *   - pyproject.toml        (Python / Poetry / Flit)
 *   - go.mod                (Go modules)
 *   - composer.json         (PHP Composer)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { KBEntry } from '@switchboard/core';
import { slugify } from '@switchboard/core';
import type { CrawlResult } from './types.js';

// ── Helpers ───────────────────────────────────────────────────────────────

async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function makeEntry(
  id: string,
  title: string,
  content: string,
  repoPath: string,
  tags: string[]
): KBEntry {
  return {
    id: slugify(id),
    category: 'Infra',
    title,
    content,
    source: `deps:${repoPath}`,
    createdAt: new Date().toISOString(),
    tags: ['auto-crawled', 'deps', ...tags],
  };
}

// ── package.json ──────────────────────────────────────────────────────────

interface PackageJson {
  name?: string;
  version?: string;
  description?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  engines?: Record<string, string>;
  workspaces?: string[] | { packages: string[] };
  packageManager?: string;
}

function formatDepsTable(deps: Record<string, string>): string {
  return Object.entries(deps)
    .map(([pkg, ver]) => `| \`${pkg}\` | \`${ver}\` |`)
    .join('\n');
}

function parsePackageJson(raw: string, repoPath: string): KBEntry | null {
  let pkg: PackageJson;
  try {
    pkg = JSON.parse(raw) as PackageJson;
  } catch {
    return null;
  }

  const name = pkg.name ?? path.basename(repoPath);
  const version = pkg.version ?? 'unknown';
  const description = pkg.description ? `\n\n${pkg.description}` : '';
  const engines = pkg.engines
    ? `\n\n**Engines:**\n${Object.entries(pkg.engines).map(([k, v]) => `- ${k}: \`${v}\``).join('\n')}`
    : '';
  const packageManager = pkg.packageManager
    ? `\n\n**Package manager:** \`${pkg.packageManager}\``
    : '';

  const sections: string[] = [
    `**Package:** \`${name}\` @ \`${version}\`${description}${packageManager}${engines}`,
  ];

  if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
    sections.push(
      `\n## Runtime Dependencies\n\n| Package | Version |\n|---------|---------|  \n${formatDepsTable(pkg.dependencies)}`
    );
  }
  if (pkg.devDependencies && Object.keys(pkg.devDependencies).length > 0) {
    sections.push(
      `\n## Dev Dependencies\n\n| Package | Version |\n|---------|---------|  \n${formatDepsTable(pkg.devDependencies)}`
    );
  }
  if (pkg.peerDependencies && Object.keys(pkg.peerDependencies).length > 0) {
    sections.push(
      `\n## Peer Dependencies\n\n| Package | Version |\n|---------|---------|  \n${formatDepsTable(pkg.peerDependencies)}`
    );
  }

  const isMonorepo = pkg.workspaces !== undefined;
  const tags = ['node', 'npm'];
  if (isMonorepo) tags.push('monorepo');

  return makeEntry(
    `${name}-package-json`,
    `Node deps: ${name}`,
    sections.join('\n'),
    repoPath,
    tags
  );
}

// ── Gemfile ───────────────────────────────────────────────────────────────

function parseGemfile(raw: string, repoPath: string): KBEntry | null {
  const lines = raw.split('\n');
  const gems: string[] = [];
  const groups: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // gem 'rails', '~> 7.0'  or  gem "devise"
    const gemMatch = trimmed.match(/^gem\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?/);
    if (gemMatch) {
      const gemName = gemMatch[1]!;
      const gemVer = gemMatch[2] ?? '*';
      gems.push(`| \`${gemName}\` | \`${gemVer}\` |`);
    }
    // group :development, :test do
    const groupMatch = trimmed.match(/^group\s+(.+)\s+do/);
    if (groupMatch) {
      groups.push(groupMatch[1]!.replace(/[:\s]+/g, ' ').trim());
    }
  }

  if (gems.length === 0) return null;

  const repoName = path.basename(repoPath);
  const content = [
    `**Ruby Gems** for \`${repoName}\``,
    groups.length > 0 ? `\n**Groups defined:** ${groups.join(', ')}` : '',
    `\n## Gems\n\n| Gem | Version |\n|-----|---------|  \n${gems.join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n');

  return makeEntry(`${repoName}-gemfile`, `Ruby deps: ${repoName}`, content, repoPath, [
    'ruby',
    'bundler',
  ]);
}

// ── Cargo.toml ────────────────────────────────────────────────────────────

function parseCargoToml(raw: string, repoPath: string): KBEntry | null {
  const lines = raw.split('\n');
  const deps: string[] = [];
  let inDeps = false;
  let packageName = path.basename(repoPath);
  let packageVersion = 'unknown';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[package]')) {
      inDeps = false;
      continue;
    }
    if (trimmed === '[dependencies]' || trimmed === '[dev-dependencies]') {
      inDeps = true;
      continue;
    }
    if (trimmed.startsWith('[') && trimmed.endsWith(']') && inDeps) {
      inDeps = false;
    }
    // name = "my-crate"
    const nameMatch = trimmed.match(/^name\s*=\s*"([^"]+)"/);
    if (nameMatch) packageName = nameMatch[1]!;
    const verMatch = trimmed.match(/^version\s*=\s*"([^"]+)"/);
    if (verMatch) packageVersion = verMatch[1]!;

    if (inDeps) {
      // serde = { version = "1.0", features = ["derive"] }  or  serde = "1.0"
      const depMatch = trimmed.match(/^([a-z0-9_-]+)\s*=\s*(?:"([^"]+)"|{[^}]*version\s*=\s*"([^"]+)")/i);
      if (depMatch) {
        const depName = depMatch[1]!;
        const depVer = depMatch[2] ?? depMatch[3] ?? '*';
        deps.push(`| \`${depName}\` | \`${depVer}\` |`);
      }
    }
  }

  if (deps.length === 0) return null;

  const content = [
    `**Rust crate:** \`${packageName}\` @ \`${packageVersion}\``,
    `\n## Dependencies\n\n| Crate | Version |\n|-------|---------|  \n${deps.join('\n')}`,
  ].join('\n');

  return makeEntry(
    `${packageName}-cargo-toml`,
    `Rust deps: ${packageName}`,
    content,
    repoPath,
    ['rust', 'cargo']
  );
}

// ── requirements.txt ─────────────────────────────────────────────────────

function parseRequirementsTxt(raw: string, repoPath: string): KBEntry | null {
  const lines = raw.split('\n');
  const deps: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
    // flask==2.3.0  or  requests>=2.28  or  numpy
    const match = trimmed.match(/^([A-Za-z0-9_.-]+)([=<>!~].+)?$/);
    if (match) {
      const pkgName = match[1]!;
      const pkgVer = (match[2] ?? '*').trim();
      deps.push(`| \`${pkgName}\` | \`${pkgVer}\` |`);
    }
  }

  if (deps.length === 0) return null;

  const repoName = path.basename(repoPath);
  const content = [
    `**Python packages** for \`${repoName}\``,
    `\n## Packages\n\n| Package | Version |\n|---------|---------|  \n${deps.join('\n')}`,
  ].join('\n');

  return makeEntry(
    `${repoName}-requirements-txt`,
    `Python deps: ${repoName}`,
    content,
    repoPath,
    ['python', 'pip']
  );
}

// ── pyproject.toml ────────────────────────────────────────────────────────

function parsePyprojectToml(raw: string, repoPath: string): KBEntry | null {
  const lines = raw.split('\n');
  const deps: string[] = [];
  let inDeps = false;
  let projectName = path.basename(repoPath);
  let projectVersion = 'unknown';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '[tool.poetry.dependencies]' || trimmed === '[project]') {
      inDeps = true;
      continue;
    }
    if (trimmed.startsWith('[') && trimmed.endsWith(']') && inDeps) {
      inDeps = false;
    }
    const nameMatch = trimmed.match(/^name\s*=\s*"([^"]+)"/);
    if (nameMatch) projectName = nameMatch[1]!;
    const verMatch = trimmed.match(/^version\s*=\s*"([^"]+)"/);
    if (verMatch) projectVersion = verMatch[1]!;

    if (inDeps) {
      const depMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=\s*"([^"]+)"/);
      if (depMatch && depMatch[1]!.toLowerCase() !== 'python') {
        deps.push(`| \`${depMatch[1]!}\` | \`${depMatch[2]!}\` |`);
      }
    }
  }

  if (deps.length === 0) return null;

  const content = [
    `**Python project:** \`${projectName}\` @ \`${projectVersion}\``,
    `\n## Dependencies\n\n| Package | Version |\n|---------|---------|  \n${deps.join('\n')}`,
  ].join('\n');

  return makeEntry(
    `${projectName}-pyproject-toml`,
    `Python deps: ${projectName}`,
    content,
    repoPath,
    ['python', 'poetry']
  );
}

// ── go.mod ────────────────────────────────────────────────────────────────

function parseGoMod(raw: string, repoPath: string): KBEntry | null {
  const lines = raw.split('\n');
  const deps: string[] = [];
  let moduleName = path.basename(repoPath);
  let goVersion = '';
  let inRequire = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const modMatch = trimmed.match(/^module\s+(.+)$/);
    if (modMatch) moduleName = modMatch[1]!.trim();
    const goMatch = trimmed.match(/^go\s+(\d+\.\d+)/);
    if (goMatch) goVersion = goMatch[1]!;
    if (trimmed === 'require (') { inRequire = true; continue; }
    if (inRequire && trimmed === ')') { inRequire = false; continue; }
    // single-line: require github.com/foo/bar v1.2.3
    const singleMatch = trimmed.match(/^require\s+(\S+)\s+(\S+)/);
    if (singleMatch) {
      deps.push(`| \`${singleMatch[1]!}\` | \`${singleMatch[2]!}\` |`);
    }
    if (inRequire) {
      const reqMatch = trimmed.match(/^(\S+)\s+(\S+)(?:\s+\/\/ indirect)?$/);
      if (reqMatch) {
        deps.push(`| \`${reqMatch[1]!}\` | \`${reqMatch[2]!}\` |`);
      }
    }
  }

  if (deps.length === 0) return null;

  const goVer = goVersion ? ` (Go ${goVersion})` : '';
  const content = [
    `**Go module:** \`${moduleName}\`${goVer}`,
    `\n## Dependencies\n\n| Module | Version |\n|--------|---------|  \n${deps.join('\n')}`,
  ].join('\n');

  return makeEntry(
    `${path.basename(moduleName)}-go-mod`,
    `Go deps: ${path.basename(moduleName)}`,
    content,
    repoPath,
    ['go', 'golang']
  );
}

// ── composer.json ─────────────────────────────────────────────────────────

interface ComposerJson {
  name?: string;
  description?: string;
  require?: Record<string, string>;
  'require-dev'?: Record<string, string>;
}

function parseComposerJson(raw: string, repoPath: string): KBEntry | null {
  let composer: ComposerJson;
  try {
    composer = JSON.parse(raw) as ComposerJson;
  } catch {
    return null;
  }

  const name = composer.name ?? path.basename(repoPath);
  const sections: string[] = [`**PHP Composer package:** \`${name}\``];

  if (composer.require && Object.keys(composer.require).length > 0) {
    sections.push(
      `\n## Require\n\n| Package | Version |\n|---------|---------|  \n${formatDepsTable(composer.require)}`
    );
  }
  if (composer['require-dev'] && Object.keys(composer['require-dev']).length > 0) {
    sections.push(
      `\n## Require-Dev\n\n| Package | Version |\n|---------|---------|  \n${formatDepsTable(composer['require-dev'])}`
    );
  }

  if (sections.length === 1) return null; // no deps found

  return makeEntry(
    `${name.replace(/\//g, '-')}-composer-json`,
    `PHP deps: ${name}`,
    sections.join('\n'),
    repoPath,
    ['php', 'composer']
  );
}

// ── Public API ────────────────────────────────────────────────────────────

export interface CrawlDepsOptions {
  /** Extra manifest file paths to try, relative to repoPath */
  extraManifests?: string[];
}

/**
 * Scan `repoPath` for dependency manifests and return KB entries for the
 * `Infra` category describing the project's tech stack.
 */
export async function crawlDeps(
  repoPath: string,
  options: CrawlDepsOptions = {}
): Promise<CrawlResult> {
  const entries: KBEntry[] = [];

  type Parser = (raw: string, repoPath: string) => KBEntry | null;

  const manifests: Array<{ file: string; parser: Parser }> = [
    { file: 'package.json', parser: parsePackageJson },
    { file: 'Gemfile', parser: parseGemfile },
    { file: 'Cargo.toml', parser: parseCargoToml },
    { file: 'requirements.txt', parser: parseRequirementsTxt },
    { file: 'pyproject.toml', parser: parsePyprojectToml },
    { file: 'go.mod', parser: parseGoMod },
    { file: 'composer.json', parser: parseComposerJson },
  ];

  // Include any caller-supplied extra manifests (they're parsed as plain text)
  for (const extra of options.extraManifests ?? []) {
    manifests.push({
      file: extra,
      parser: (raw, rp) => {
        const basename = path.basename(extra);
        return makeEntry(
          `${path.basename(rp)}-${slugify(basename)}`,
          `Deps manifest: ${basename}`,
          `\`\`\`\n${raw.slice(0, 4000)}\n\`\`\``,
          rp,
          ['manifest', 'auto-crawled']
        );
      },
    });
  }

  for (const { file, parser } of manifests) {
    const filePath = path.join(repoPath, file);
    const raw = await readFileSafe(filePath);
    if (raw === null) continue;

    const entry = parser(raw, repoPath);
    if (entry !== null) entries.push(entry);
  }

  return {
    entries,
    source: 'deps',
    repoPath,
    crawledAt: new Date(),
  };
}
