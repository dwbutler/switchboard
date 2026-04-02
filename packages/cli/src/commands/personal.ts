/**
 * `switchboard personal` — launch the interactive personal life-audit TUI.
 * Reads config from ~/.switchboard/openclaw.json, constructs a CliBot
 * backed by the ModelRouter, then renders the full Ink App.
 */

import { Command } from "commander";
import { render } from "ink";
import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ModelRouterConfig } from "@switchboard/core";
import { App } from "../components/App.js";
import { CliBot } from "../cli-bot.js";

const CONFIG_FILE = join(homedir(), ".switchboard", "openclaw.json");

interface SwitchboardConfig {
  version?: number;
  profile?: { name?: string; timezone?: string };
  audit?: {
    model?: string;
    historyFile?: string;
    providerOrder?: string[];
  };
  keys?: {
    anthropicApiKey?: string;
    openaiApiKey?: string;
  };
}

function loadConfig(): SwitchboardConfig {
  if (!existsSync(CONFIG_FILE)) {
    console.error(
      `No config found at ${CONFIG_FILE}.\nRun \`switchboard init\` first.`,
    );
    process.exit(1);
  }
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as SwitchboardConfig;
  } catch (err) {
    console.error(`Failed to parse config: ${(err as Error).message}`);
    process.exit(1);
  }
}

function buildRouterConfig(config: SwitchboardConfig): ModelRouterConfig {
  const audit = config.audit ?? {};
  const keys = config.keys ?? {};
  return {
    anthropicApiKey: keys.anthropicApiKey ?? process.env["ANTHROPIC_API_KEY"] ?? "",
    openaiApiKey: keys.openaiApiKey ?? process.env["OPENAI_API_KEY"] ?? "",
    anthropicModel: audit.model ?? "claude-3-5-haiku-20241022",
    providerOrder: (audit.providerOrder as ModelRouterConfig["providerOrder"]) ?? [
      "ollama",
      "anthropic",
      "openai",
    ],
  };
}

export const personalCommand = new Command("personal")
  .description("Start the personal life-audit assistant (interactive TUI)")
  .option("--no-tui", "Run in plain text mode without Ink (useful for piped input)", false)
  .action(async (opts: { tui: boolean }) => {
    const config = loadConfig();
    const routerConfig = buildRouterConfig(config);

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
      // Minimal plain-text fallback (useful in CI / scripted flows)
      console.log("Switchboard — Personal Life Audit");
      console.log("─".repeat(40));
      console.log(greeting);
      console.log("\n(Interactive TUI disabled — use stdin for input)");
      return;
    }

    // Render the full Ink TUI
    const { waitUntilExit } = render(
      React.createElement(App, { greeting, bot }),
      { exitOnCtrlC: true },
    );

    await waitUntilExit();
  });
