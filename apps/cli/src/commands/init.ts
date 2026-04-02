/**
 * `switchboard init` action — scaffolds ~/.switchboard/ config directory.
 *
 * Extracted into its own module so it can be dynamically imported by
 * index.ts without loading Ink/React for every command invocation.
 *
 * NOTE: Node16 module resolution requires .js extensions on all
 * relative imports even though the source files are .ts/.tsx.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".switchboard");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

const STARTER_CONFIG = {
  version: 1,
  profile: {
    name: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
  models: {
    default: "claude-3-5-haiku-20241022",
  },
};

export interface InitOptions {
  force: boolean;
}

export async function runInit(opts: InitOptions): Promise<void> {
  // Create config dir
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
    console.log(`✔ Created ${CONFIG_DIR}`);
  } else {
    console.log(`  Config dir already exists: ${CONFIG_DIR}`);
  }

  // Write starter config.json
  if (!existsSync(CONFIG_FILE) || opts.force) {
    writeFileSync(CONFIG_FILE, JSON.stringify(STARTER_CONFIG, null, 2) + "\n", "utf-8");
    console.log(`✔ Wrote ${CONFIG_FILE}`);
  } else {
    console.log(`  Config already exists (use --force to overwrite): ${CONFIG_FILE}`);
  }

  console.log(
    [
      "",
      "Next steps:",
      `  1. Edit ${CONFIG_FILE} to fill in your profile and model preferences.`,
      "  2. Run `switchboard chat` to start chatting.",
      "",
    ].join("\n"),
  );
}
