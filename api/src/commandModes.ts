import type { CommandMode } from "./types.js";

export const supportedCommandModes: CommandMode[] = ["gitflow"];

export function normalizeEnabledTaskTypes(value: unknown): CommandMode[] {
  const rawModes = readRawModes(value);
  if (rawModes.length === 0) return [...supportedCommandModes];

  const modes: CommandMode[] = [];
  for (const rawMode of rawModes) {
    const mode = rawMode.trim().toLowerCase();
    if (!isCommandMode(mode)) continue;
    if (!modes.includes(mode)) modes.push(mode);
  }

  return modes.length > 0 ? modes : [...supportedCommandModes];
}

export function isTaskTypeEnabled(enabledTaskTypes: CommandMode[] | undefined, commandMode: CommandMode): boolean {
  return normalizeEnabledTaskTypes(enabledTaskTypes).includes(commandMode);
}

function readRawModes(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    return value
      .split(/[|,]/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  return [];
}

function isCommandMode(value: string): value is CommandMode {
  return value === "gitflow";
}
