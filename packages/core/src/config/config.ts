/**
 * Switchboard config reader/writer.
 * Config lives at ~/.switchboard/config.json
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { SwitchboardConfig } from './types.js';
import { CONFIG_DEFAULTS } from './types.js';

export function getSwitchboardDir(): string {
  return path.join(os.homedir(), '.switchboard');
}

export function getConfigPath(): string {
  return path.join(getSwitchboardDir(), 'config.json');
}

export async function readConfig(): Promise<SwitchboardConfig> {
  const configPath = getConfigPath();
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(raw) as SwitchboardConfig;
  } catch {
    // Config doesn't exist yet — return defaults
    return { ...CONFIG_DEFAULTS };
  }
}

export async function writeConfig(config: SwitchboardConfig): Promise<void> {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  await fs.mkdir(dir, { recursive: true });
  const updated: SwitchboardConfig = {
    ...config,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(configPath, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
}

export async function updateConfig(
  updates: Partial<SwitchboardConfig>
): Promise<SwitchboardConfig> {
  const current = await readConfig();
  const next = { ...current, ...updates };
  await writeConfig(next);
  return next;
}

/** Read config and build a ModelRouterConfig from it */
export async function loadModelRouterConfig(): Promise<{
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
  openaiApiKey?: string;
  openaiModel?: string;
}> {
  const config = await readConfig();
  return {
    ollamaBaseUrl: config.ollamaBaseUrl,
    ollamaModel: config.ollamaModel,
    anthropicApiKey: config.anthropicApiKey,
    anthropicModel: config.anthropicModel,
    openaiApiKey: config.openaiApiKey,
    openaiModel: config.openaiModel,
  };
}
