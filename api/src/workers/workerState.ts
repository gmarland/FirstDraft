import { WorkerRegistration } from "../types.js";

export function normalizeMaxConcurrentTasks(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : null;
  if (numeric === null || !Number.isFinite(numeric)) return null;
  return Math.max(1, Math.min(8, Math.floor(numeric)));
}

export function getActiveTransactionIds(
  client?: Pick<WorkerRegistration, "activeTransactionIds" | "currentTransactionId">
): string[] {
  if (!client) return [];
  const activeTransactionIds = Array.isArray(client.activeTransactionIds)
    ? client.activeTransactionIds
    : [];
  const ids = activeTransactionIds.length > 0
    ? activeTransactionIds
    : client.currentTransactionId
      ? [client.currentTransactionId]
      : [];
  return [...new Set(ids.filter(Boolean))];
}

export function canDispatchMoreCommands(client?: WorkerRegistration): boolean {
  if (!client || client.state === "stopped") return false;
  const maxConcurrentTasks = normalizeMaxConcurrentTasks(client.maxConcurrentTasks);
  return maxConcurrentTasks === null || getActiveTransactionIds(client).length < maxConcurrentTasks;
}
