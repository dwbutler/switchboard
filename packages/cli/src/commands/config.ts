/**
 * `switchboard config` — read and write the user's Switchboard configuration.
 *
 * Config lives at ~/.switchboard/config.json and is managed via @switchboard/core.
 *
 * Sub-commands:
 *   show                   Pretty-print the current config
 *   set <key> <value>      Set a specific config key
 *   get <key>              Print a single key's value
 *   reset                  Reset config to defaults
 *
 * Settable keys map 1:1 to SwitchboardConfig fields.
 */

import { Command } from "commander";
import {
  readConfig,
  writeConfig,
  updateConfig,
  CONFIG_DEFAULTS,
} from "@switchboard/core";
import type { SwitchboardConfig } from "@switchboard/core";

// ── Key validation ─────────────────────────────────────────────────────────

const SETTABLE_KEYS = [
  "modelProvider",
  "ollamaBaseUrl",
  "ollamaModel",
  "anthropicApiKey",
  "anthropicModel",
  "openaiApiKey",
  "openaiModel",
  "telegramBotToken",
  "gatewayPort",
] as const;

type SettableKey = (typeof SETTABLE_KEYS)[number];

function isSettableKey(k: string): k is SettableKey {
  return (SETTABLE_KEYS as readonly string[]).includes(k);
}

/** Coerce a raw string value to the correct type for a given key. */
function coerceValue(key: SettableKey, raw: string): string | number {
  if (key === "gatewayPort") {
    const n = parseInt(raw, 10);
    if (isNaN(n) || n < 1 || n > 65535) {
      console.error(`Invalid port number: "${raw}"`);
      process.exit(1);
    }
    return n;
  }
  if (key === "modelProvider") {
    const valid = ["ollama", "anthropic", "openai"];
    if (!valid.includes(raw)) {
      console.error(`Invalid modelProvider "${raw}". Valid values: ${valid.join(", ")}`);
      process.exit(1);
    }
  }
  return raw;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Mask API key values for safe display */
function maskValue(key: string, value: unknown): string {
  if (typeof value !== "string" || value === "") return String(value ?? "");
  if (key.toLowerCase().includes("key") || key.toLowerCase().includes("token")) {
    return value.length > 8
      ? `${value.slice(0, 4)}${"*".repeat(value.length - 8)}${value.slice(-4)}`
      : "****";
  }
  return String(value);
}

function printConfig(config: SwitchboardConfig, mask = true): void {
  const entries = Object.entries(config).filter(([k]) => k !== "updatedAt");
  const maxLen = Math.max(...entries.map(([k]) => k.length));
  for (const [k, v] of entries) {
    const display = mask ? maskValue(k, v) : String(v ?? "");
    console.log(`  ${k.padEnd(maxLen)}  ${display}`);
  }
  if (config.updatedAt) {
    console.log(`\nLast updated: ${config.updatedAt.slice(0, 19).replace("T", " ")} UTC`);
  }
}

// ── show ──────────────────────────────────────────────────────────────────

const showCmd = new Command("show")
  .description("Print current configuration")
  .option("--reveal", "Show API keys in plain text (use with care)", false)
  .action(async (opts: { reveal: boolean }) => {
    const config = await readConfig();
    console.log("\nSwitchboard Configuration (~/.switchboard/config.json)\n");
    printConfig(config, !opts.reveal);
  });

// ── get ───────────────────────────────────────────────────────────────────

const getCmd = new Command("get")
  .description("Print the value of a single config key")
  .argument("<key>", `Config key to read (e.g. modelProvider)`)
  .option("--reveal", "Show API keys / tokens in plain text", false)
  .action(async (key: string, opts: { reveal: boolean }) => {
    const config = await readConfig();
    const value = (config as Record<string, unknown>)[key];
    if (value === undefined) {
      console.error(
        `Unknown config key: "${key}"\nSettable keys: ${SETTABLE_KEYS.join(", ")}`,
      );
      process.exit(1);
    }
    const display = opts.reveal ? String(value) : maskValue(key, value);
    console.log(display);
  });

// ── set ───────────────────────────────────────────────────────────────────

const setCmd = new Command("set")
  .description("Set a config key to a new value")
  .argument("<key>", `Config key to set. Valid keys: ${SETTABLE_KEYS.join(", ")}`)
  .argument("<value>", "Value to assign")
  .action(async (key: string, rawValue: string) => {
    if (!isSettableKey(key)) {
      console.error(
        `Unknown or read-only config key: "${key}"\nSettable keys: ${SETTABLE_KEYS.join(", ")}`,
      );
      process.exit(1);
    }

    const value = coerceValue(key, rawValue);
    const updated = await updateConfig({ [key]: value } as Partial<SwitchboardConfig>);
    const display = maskValue(key, updated[key as keyof SwitchboardConfig]);
    console.log(`✔ Set ${key} = ${display}`);
  });

// ── reset ─────────────────────────────────────────────────────────────────

const resetCmd = new Command("reset")
  .description("Reset configuration to defaults (removes API keys)")
  .option("--yes", "Skip confirmation prompt", false)
  .action(async (opts: { yes: boolean }) => {
    if (!opts.yes) {
      console.log("This will reset all config values to defaults and remove stored API keys.");
      console.log("Re-run with --yes to confirm.");
      process.exit(0);
    }

    await writeConfig({ ...CONFIG_DEFAULTS });
    console.log("✔ Configuration reset to defaults.");
    console.log("  Run `switchboard config set anthropicApiKey <key>` to set your API key.");
  });

// ── Root config command ───────────────────────────────────────────────────

export const configCommand = new Command("config")
  .description("Read and write Switchboard configuration (~/.switchboard/config.json)")
  .addCommand(showCmd)
  .addCommand(getCmd)
  .addCommand(setCmd)
  .addCommand(resetCmd);
