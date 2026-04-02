/**
 * `switchboard kb` — manage the local Knowledge Base.
 *
 * Sub-commands:
 *   list [--category <cat>]      List all KB entries (optionally filtered by category)
 *   show <id> --category <cat>   Print a single entry's content
 *   add  --category <cat> --title <t> --content <c>   Create an entry
 *   delete <id> --category <cat>  Remove an entry
 *
 * The KB is stored in {cwd}/.switchboard/knowledge-base/<category>/<id>.md
 */

import { Command } from "commander";
import { homedir } from "node:os";
import { join } from "node:path";
import { KBWriter } from "@switchboard/core";
import type { KBCategory } from "@switchboard/core";

// Use the user's home directory as the workspace root so the KB lives at
// ~/.switchboard/knowledge-base/ — consistent with the rest of the CLI.
const WORKSPACE_ROOT = homedir();

const VALID_CATEGORIES: KBCategory[] = ["Code", "Infra", "Decisions", "People"];

function assertCategory(raw: string): KBCategory {
  if (!VALID_CATEGORIES.includes(raw as KBCategory)) {
    console.error(
      `Invalid category "${raw}". Valid values: ${VALID_CATEGORIES.join(", ")}`,
    );
    process.exit(1);
  }
  return raw as KBCategory;
}

// ── list ──────────────────────────────────────────────────────────────────

const listCmd = new Command("list")
  .description("List KB entries (all categories, or filtered by --category)")
  .option(
    "--category <category>",
    `Filter by category: ${VALID_CATEGORIES.join(" | ")}`,
  )
  .action(async (opts: { category?: string }) => {
    const writer = new KBWriter(WORKSPACE_ROOT);

    const entries = opts.category
      ? await writer.listCategory(assertCategory(opts.category))
      : await writer.listAll();

    if (entries.length === 0) {
      console.log(
        opts.category
          ? `No entries found in category "${opts.category}".`
          : "No KB entries found. Use `switchboard kb add` to create one.",
      );
      return;
    }

    // Group by category for display
    const grouped = entries.reduce<Record<string, typeof entries>>((acc, e) => {
      (acc[e.category] ??= []).push(e);
      return acc;
    }, {});

    for (const [cat, catEntries] of Object.entries(grouped)) {
      console.log(`\n${cat}`);
      console.log("─".repeat(cat.length));
      for (const e of catEntries) {
        const updated = e.updatedAt ? ` (updated ${e.updatedAt.slice(0, 10)})` : "";
        const tags = e.tags && e.tags.length ? `  [${e.tags.join(", ")}]` : "";
        console.log(`  ${e.id.padEnd(30)} ${e.title}${tags}${updated}`);
      }
    }

    console.log(`\nTotal: ${entries.length} entr${entries.length === 1 ? "y" : "ies"}`);
  });

// ── show ──────────────────────────────────────────────────────────────────

const showCmd = new Command("show")
  .description("Show a single KB entry")
  .argument("<id>", "Entry ID (slug)")
  .requiredOption(
    "--category <category>",
    `Category of the entry: ${VALID_CATEGORIES.join(" | ")}`,
  )
  .action(async (id: string, opts: { category: string }) => {
    const writer = new KBWriter(WORKSPACE_ROOT);
    const category = assertCategory(opts.category);
    const entry = await writer.read(category, id);

    if (!entry) {
      console.error(`Entry not found: ${category}/${id}`);
      process.exit(1);
    }

    console.log(`\n── ${entry.title} ──`);
    console.log(`Category : ${entry.category}`);
    console.log(`ID       : ${entry.id}`);
    console.log(`Source   : ${entry.source}`);
    console.log(`Created  : ${entry.createdAt.slice(0, 10)}`);
    if (entry.updatedAt) console.log(`Updated  : ${entry.updatedAt.slice(0, 10)}`);
    if (entry.tags?.length) console.log(`Tags     : ${entry.tags.join(", ")}`);
    console.log("\nContent:");
    console.log("─".repeat(40));
    console.log(entry.content);
  });

// ── add ───────────────────────────────────────────────────────────────────

const addCmd = new Command("add")
  .description("Create a new KB entry")
  .requiredOption(
    "--category <category>",
    `Category: ${VALID_CATEGORIES.join(" | ")}`,
  )
  .requiredOption("--title <title>", "Entry title")
  .requiredOption("--content <content>", "Markdown content for the entry")
  .option("--tags <tags>", "Comma-separated tags, e.g. auth,backend")
  .option("--source <source>", "Source label", "manual")
  .option("--id <id>", "Custom slug ID (auto-derived from title if omitted)")
  .action(
    async (opts: {
      category: string;
      title: string;
      content: string;
      tags?: string;
      source: string;
      id?: string;
    }) => {
      const writer = new KBWriter(WORKSPACE_ROOT);
      const category = assertCategory(opts.category);
      const tags = opts.tags
        ? opts.tags.split(",").map((t) => t.trim()).filter(Boolean)
        : undefined;

      const result = await writer.create({
        category,
        title: opts.title,
        content: opts.content,
        source: opts.source,
        tags,
        ...(opts.id ? { id: opts.id } : {}),
      });

      const action = result.created ? "Created" : "Updated";
      console.log(`✔ ${action} KB entry: ${result.entry.category}/${result.entry.id}`);
      console.log(`  File: ${result.filePath}`);
    },
  );

// ── delete ────────────────────────────────────────────────────────────────

const deleteCmd = new Command("delete")
  .alias("rm")
  .description("Delete a KB entry")
  .argument("<id>", "Entry ID (slug)")
  .requiredOption(
    "--category <category>",
    `Category of the entry: ${VALID_CATEGORIES.join(" | ")}`,
  )
  .option("--yes", "Skip confirmation prompt", false)
  .action(async (id: string, opts: { category: string; yes: boolean }) => {
    const writer = new KBWriter(WORKSPACE_ROOT);
    const category = assertCategory(opts.category);

    // Verify it exists before deleting
    const entry = await writer.read(category, id);
    if (!entry) {
      console.error(`Entry not found: ${category}/${id}`);
      process.exit(1);
    }

    if (!opts.yes) {
      console.log(`About to delete: ${entry.title} (${category}/${id})`);
      console.log("Re-run with --yes to confirm.");
      process.exit(0);
    }

    const deleted = await writer.delete(category, id);
    if (deleted) {
      console.log(`✔ Deleted KB entry: ${category}/${id}`);
    } else {
      console.error(`Failed to delete entry: ${category}/${id}`);
      process.exit(1);
    }
  });

// ── Root kb command ───────────────────────────────────────────────────────

export const kbCommand = new Command("kb")
  .description("Manage the local Knowledge Base (.switchboard/knowledge-base/)")
  .addCommand(listCmd)
  .addCommand(showCmd)
  .addCommand(addCmd)
  .addCommand(deleteCmd);
