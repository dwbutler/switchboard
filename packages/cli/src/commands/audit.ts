/**
 * `switchboard audit` — launch the interactive life-audit TUI.
 *
 * This is an alias / ergonomic synonym for `switchboard personal`.
 * It provides the same Ink-based interview experience but under the
 * more discoverable `audit` sub-command name.
 */

import { Command } from "commander";
import { render } from "ink";
import React from "react";
import type { ModelRouterConfig } from "@switchboard/core";
import { readConfig } from "@switchboard/core";
import { App } from "../components/App.js";
import { CliBot } from "../cli-bot.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function buildRouterConfig(config: Awaited<ReturnType<typeof readConfig>>): ModelRouterConfig {
  return {
    anthropicApiKey: config.anthropicApiKey ?? process.env["ANTHROPIC_API_KEY"] ?? "",
    openaiApiKey: config.openaiApiKey ?? process.env["OPENAI_API_KEY"] ?? "",
    anthropicModel: config.anthropicModel ?? "claude-3-5-haiku-20241022",
    ollamaBaseUrl: config.ollamaBaseUrl,
    ollamaModel: config.ollamaModel,
    openaiModel: config.openaiModel,
  };
}

// ── Command ────────────────────────────────────────────────────────────────

export const auditCommand = new Command("audit")
  .description("Start the personal life-audit interview (interactive TUI)")
  .option("--no-tui", "Run in plain text mode without Ink (useful for piped input)")
  .option(
    "--provider <provider>",
    "Override the AI provider: ollama | anthropic | openai",
  )
  .action(async (opts: { tui: boolean; provider?: string }) => {
    // Load config from ~/.switchboard/config.json (core handles missing files gracefully)
    const config = await readConfig();

    const routerConfig = buildRouterConfig(config);

    // Override provider order if explicitly requested
    if (opts.provider) {
      const p = opts.provider as "ollama" | "anthropic" | "openai";
      routerConfig.providerOrder = [p];
    }

    const bot = new CliBot({ modelRouter: routerConfig });

    // Obtain the opening greeting before rendering so it appears immediately
    let greeting: string;
    try {
      greeting = await bot.start();
    } catch (err) {
      console.error(`Failed to start audit: ${(err as Error).message}`);
      process.exit(1);
    }

    if (!opts.tui) {
      // Minimal plain-text fallback
      console.log("Switchboard — Personal Life Audit");
      console.log("─".repeat(40));
      console.log(greeting);
      console.log("\n(Interactive TUI disabled — use stdin for input)");
      return;
    }

    const { waitUntilExit } = render(
      React.createElement(App, { greeting, bot }),
      { exitOnCtrlC: true },
    );

    await waitUntilExit();
  });
