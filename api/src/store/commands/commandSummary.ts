import type { CommandMode } from "../../types.js";

export function buildTaskSummary(command: string, commandMode: CommandMode): string {
  try {
    const payload = JSON.parse(command) as Partial<{
      repositoryUrl: unknown;
      ticketNumber: unknown;
      title: unknown;
      description: unknown;
    }>;
    const ticketNumber = readString(payload.ticketNumber);
    const title = readString(payload.title);
    const description = readString(payload.description);
    const repositoryUrl = readString(payload.repositoryUrl);
    return `${ticketNumber || "Gitflow"}: ${title || description || repositoryUrl || command}`;
  } catch {
    return command;
  }
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
