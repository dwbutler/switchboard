#!/usr/bin/env node

/**
 * Switchboard CLI entry point.
 * Wires up Commander commands and dispatches to subcommands.
 */

import { Command } from "commander";
import { personalCommand } from "./commands/personal.js";
import { initCommand } from "./commands/init.js";
import { migrateCommand } from "./commands/migrate.js";
import { auditCommand } from "./commands/audit.js";
import { kbCommand } from "./commands/kb.js";
import { configCommand } from "./commands/config.js";

const program = new Command();

program
  .name("switchboard")
  .description("Your personal life-audit assistant — terminal interface")
  .version("0.1.0");

program.addCommand(initCommand);
program.addCommand(auditCommand);
program.addCommand(personalCommand);
program.addCommand(kbCommand);
program.addCommand(configCommand);
program.addCommand(migrateCommand);

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error("Error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
