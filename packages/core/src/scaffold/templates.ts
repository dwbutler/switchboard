/**
 * Template strings for .switchboard/ workspace scaffold.
 * These are written to disk when a new workspace is initialized.
 */

export function agentsMdTemplate(workspaceName: string, workspaceRoot: string): string {
  return `# AGENTS.md — Switchboard Workspace

You are an AI agent working inside the **${workspaceName}** workspace.
This file lives at \`${workspaceRoot}/.switchboard/AGENTS.md\`.

## Every Session

Before doing anything else:
1. Read \`MEMORY.md\` in this workspace — that's your continuity
2. Scan \`knowledge-base/\` for context relevant to the current task
3. Check today's \`memory/YYYY-MM-DD.md\` if it exists

Don't ask permission. Just do it.

## Memory

Your working memory is split across:
- **MEMORY.md** — curated long-term facts about this workspace
- **memory/YYYY-MM-DD.md** — daily session logs (raw, append-only)
- **knowledge-base/** — structured reference data (see below)

Write things down. Mental notes don't survive session restarts.

### Write cadence
- Every 3–5 messages: flush key points to \`memory/YYYY-MM-DD.md\`
- Immediately on: decisions, architecture changes, new people/orgs, errors resolved
- Don't batch — small frequent writes beat one end-of-session dump

## Knowledge Base

Structured memory lives in \`knowledge-base/{category}/\`.

| Category | What goes here |
|---|---|
| Code | Patterns, APIs, tech decisions, code conventions |
| Infra | Infrastructure, deployment, ops, environments |
| Decisions | Architectural or product decisions with rationale |
| People | People, teams, organizations with context |

**Rules:**
- When a conversation surfaces a concrete, reusable fact → write it to the KB
- New entity (person, org, service) → create \`knowledge-base/{category}/{slug}.md\`
- Use wiki-style links: \`[[People/jane-smith|Jane Smith]]\`
- Never overwrite — read first, then append or update

## Tone & Behavior

- Direct, clear, warm — not corporate, not a cheerleader
- Never say "Great question!" or equivalent
- If you don't know, say so — don't hallucinate
- Prefer specificity over hedging
- When in doubt: write it down, ask if unclear, ship small

## Workspace Root
\`\`\`
${workspaceRoot}
\`\`\`
`;
}

export function memoryMdTemplate(workspaceName: string): string {
  const now = new Date().toISOString();
  return `# MEMORY.md — ${workspaceName}

*Curated long-term memory for this workspace. Updated by AI agents and humans.*
*Last updated: ${now}*

---

## Workspace Overview

<!-- Fill in: what is this workspace for? what are the key goals? -->

## Key Decisions

<!-- Major architectural or product decisions with rationale -->

## People & Teams

<!-- Key people involved in this workspace -->

## Active Work

<!-- What's currently in flight -->

## Context & Notes

<!-- Anything else worth remembering across sessions -->
`;
}

export function kbReadmeTemplate(): string {
  return `# Knowledge Base

Structured workspace memory. Each entry is a markdown file with YAML frontmatter.

## Structure

\`\`\`
knowledge-base/
  Code/          # Code patterns, APIs, tech decisions, conventions
  Infra/         # Infrastructure, deployment, ops
  Decisions/     # Architectural/product decisions with rationale
  People/        # People, teams, organizations
\`\`\`

## Entry Format

\`\`\`md
---
id: "entry-slug"
category: "Code"
title: "Entry Title"
source: "chat-session | manual | audit"
createdAt: "2026-01-01T00:00:00.000Z"
tags: ["optional", "tags"]
---

# Entry Title

Full markdown content here.
\`\`\`

## Writing Entries

Entries are managed by the Switchboard KB writer. To add an entry manually,
create a \`.md\` file in the appropriate category directory following the format above.
`;
}

export function openclawJsonTemplate(workspaceName: string, workspaceRoot: string): string {
  const template = {
    _comment: 'Switchboard openclaw.json — configure your AI agent here',
    meta: {
      workspace: workspaceName,
      workspaceRoot,
      lastTouchedAt: new Date().toISOString(),
    },
    env: {
      vars: {
        ANTHROPIC_API_KEY: '',
        OPENAI_API_KEY: '',
      },
    },
    models: {
      providers: {
        ollama: {
          baseUrl: 'http://localhost:11434',
          api: 'ollama-chat',
          models: [
            {
              id: 'llama3.2',
              name: 'Llama 3.2 (local)',
              contextWindow: 128000,
              maxTokens: 4096,
            },
          ],
        },
        anthropic: {
          baseUrl: 'https://api.anthropic.com',
          apiKeyEnvVar: 'ANTHROPIC_API_KEY',
          api: 'anthropic-messages',
          models: [
            {
              id: 'claude-3-5-haiku-20241022',
              name: 'Claude 3.5 Haiku',
              contextWindow: 200000,
              maxTokens: 8192,
            },
            {
              id: 'claude-opus-4-5',
              name: 'Claude Opus 4.5',
              contextWindow: 200000,
              maxTokens: 8192,
            },
          ],
        },
        openai: {
          baseUrl: 'https://api.openai.com/v1',
          apiKeyEnvVar: 'OPENAI_API_KEY',
          api: 'openai-completions',
          models: [
            {
              id: 'gpt-4o-mini',
              name: 'GPT-4o Mini',
              contextWindow: 128000,
              maxTokens: 16384,
            },
            {
              id: 'gpt-4o',
              name: 'GPT-4o',
              contextWindow: 128000,
              maxTokens: 16384,
            },
          ],
        },
      },
      defaults: {
        primary: 'ollama/llama3.2',
        fallbacks: ['anthropic/claude-3-5-haiku-20241022', 'openai/gpt-4o-mini'],
      },
    },
    switchboard: {
      gatewayPort: 3000,
      telegramBotToken: '',
    },
  };

  return JSON.stringify(template, null, 2) + '\n';
}
