/**
 * `switchboard init` — scaffold a ~/.switchboard/ config directory for the
 * current user.  Creates the directory and a starter openclaw.json config
 * if they do not already exist.
 */

import { Command } from "commander";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".switchboard");
const CONFIG_FILE = join(CONFIG_DIR, "openclaw.json");

const STARTER_CONFIG = {
  version: 1,
  profile: {
    name: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
  audit: {
    model: "claude-3-5-haiku-20241022",
    historyFile: "history.json",
  },
  telegram: {
    enabled: false,
    token: "",
    chatId: "",
  },
};

export const initCommand = new Command("init")
  .description("Initialise ~/.switchboard/ config directory")
  .option("--force", "Overwrite existing config if present", false)
  .action(async (opts: { force: boolean }) => {
    // Create config dir
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
      console.log(`✔ Created ${CONFIG_DIR}`);
    } else {
      console.log(`  Config dir already exists: ${CONFIG_DIR}`);
    }

    // Write starter openclaw.json
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
        `  1. Edit ${CONFIG_FILE} to fill in your profile and API keys.`,
        "  2. Run `switchboard personal` to start your life audit.",
        "",
      ].join("\n"),
    );
  });
