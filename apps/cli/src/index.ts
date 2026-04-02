#!/usr/bin/env node

/**
 * apps/cli — Switchboard CLI entry point.
 *
 * Wires up Commander commands and dispatches to subcommands.
 * Each command may render an Ink UI (see cli.tsx) or run a
 * plain Node.js action directly.
 *
 * NOTE: Node16 module resolution requires .js extensions on all
 * relative imports even though the source files are .ts/.tsx.
 */

import { Command } from "commander";

// ── Top-level program ─────────────────────────────────────────────────────

const program = new Command();

program
  .name("switchboard")
  .description("Switchboard — unified AI agent orchestration terminal interface")
  .version("0.1.0");

// ── `switchboard chat` ────────────────────────────────────────────────────
//
// Launches the full Ink-based chat UI (see cli.tsx / components/).

program
  .command("chat")
  .description("Start an interactive chat session with the Switchboard AI")
  .option("-m, --model <model>", "Model identifier to use (overrides config)")
  .option("--no-color", "Disable colour output")
  .action(async (opts: { model?: string; color: boolean }) => {
    // Dynamically import the Ink entry point so the rest of Commander
    // commands remain fast to parse without loading React/Ink eagerly.
    const { renderCli } = await import("./cli.js");
    await renderCli({ model: opts.model, color: opts.color });
  });

// ── `switchboard init` ────────────────────────────────────────────────────
//
// Scaffolds ~/.switchboard/ config directory for first-time setup.

program
  .command("init")
  .description("Initialise ~/.switchboard/ config directory")
  .option("--force", "Overwrite existing config if present", false)
  .action(async (opts: { force: boolean }) => {
    const { runInit } = await import("./commands/init.js");
    await runInit(opts);
  });

// ── `switchboard version` ─────────────────────────────────────────────────
//
// Alias for -V / --version but as a subcommand for discoverability.

program
  .command("version")
  .description("Print the Switchboard CLI version")
  .action(() => {
    console.log("switchboard-cli v0.1.0");
  });

// ── Parse ─────────────────────────────────────────────────────────────────

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error("Error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
