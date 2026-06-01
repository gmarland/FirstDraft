import type { Command } from "../types/api";

export function formatCommandSummary(command: Command): string {
  if (command.taskSummary) return command.taskSummary;

  try {
    const payload = JSON.parse(command.command) as Partial<{
      repositoryUrl: unknown;
      ticketNumber: unknown;
      title: unknown;
      description: unknown;
    }>;
    const ticketNumber = readString(payload.ticketNumber);
    const summary =
      readString(payload.title) ||
      readString(payload.description) ||
      readString(payload.repositoryUrl) ||
      command.command;

    return `${ticketNumber || "Gitflow"}: ${summary}`;
  } catch {
    return command.command;
  }
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
