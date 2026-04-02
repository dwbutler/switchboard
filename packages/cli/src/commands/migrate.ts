/**
 * `switchboard migrate` — migrate audit history / config data between
 * schema versions.  Reads the current version from
 * ~/.switchboard/openclaw.json and applies any pending migrations.
 */

import { Command } from "commander";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".switchboard");
const CONFIG_FILE = join(CONFIG_DIR, "openclaw.json");

interface Config {
  version?: number;
  [key: string]: unknown;
}

// ── Migration registry ─────────────────────────────────────────────────────

type MigrationFn = (cfg: Config) => Config;

interface Migration {
  fromVersion: number;
  toVersion: number;
  description: string;
  run: MigrationFn;
}

/**
 * Add new migrations here in ascending version order.
 * Each migration receives the config at `fromVersion` and must return it
 * at `toVersion`.
 */
const MIGRATIONS: Migration[] = [
  {
    fromVersion: 0,
    toVersion: 1,
    description: "Bootstrap version field",
    run(cfg) {
      return { ...cfg, version: 1 };
    },
  },
  // Future migrations:
  // {
  //   fromVersion: 1,
  //   toVersion: 2,
  //   description: "...",
  //   run(cfg) { return { ...cfg, version: 2, ... }; },
  // },
];

const LATEST_VERSION = MIGRATIONS.reduce((max, m) => Math.max(max, m.toVersion), 1);

// ── Helpers ────────────────────────────────────────────────────────────────

function loadConfig(): Config {
  if (!existsSync(CONFIG_FILE)) {
    console.error(`No config found at ${CONFIG_FILE}.\nRun \`switchboard init\` first.`);
    process.exit(1);
  }
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as Config;
  } catch (err) {
    console.error(`Failed to parse config: ${(err as Error).message}`);
    process.exit(1);
  }
}

function saveConfig(cfg: Config): void {
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + "\n", "utf-8");
}

// ── Command ────────────────────────────────────────────────────────────────

export const migrateCommand = new Command("migrate")
  .description("Migrate ~/.switchboard/ config and history to the latest schema version")
  .option("--dry-run", "Show what would change without writing anything", false)
  .action(async (opts: { dryRun: boolean }) => {
    const config = loadConfig();
    const currentVersion = typeof config.version === "number" ? config.version : 0;

    if (currentVersion >= LATEST_VERSION) {
      console.log(`✔ Config is already at the latest version (v${currentVersion}).`);
      return;
    }

    console.log(`Config version: v${currentVersion} → target: v${LATEST_VERSION}`);

    // Apply all pending migrations in order
    let updated: Config = config;
    const pending = MIGRATIONS.filter((m) => m.fromVersion >= currentVersion);

    for (const migration of pending) {
      if (opts.dryRun) {
        console.log(`  [dry-run] Would apply: v${migration.fromVersion} → v${migration.toVersion}: ${migration.description}`);
      } else {
        console.log(`  Applying: v${migration.fromVersion} → v${migration.toVersion}: ${migration.description}`);
        updated = migration.run(updated);
      }
    }

    if (!opts.dryRun) {
      saveConfig(updated);
      console.log(`✔ Config migrated to v${LATEST_VERSION} and saved.`);
    } else {
      console.log("\n(Dry-run complete — no files changed.)");
    }
  });
