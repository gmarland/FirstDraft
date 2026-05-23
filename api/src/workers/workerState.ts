import { WorkerRegistration } from "../types.js";

export function normalizeMaxConcurrentTasks(value: unknown): number {
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : 1;
  if (!Number.isFinite(numeric)) return 1;
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
  return getActiveTransactionIds(client).length < normalizeMaxConcurrentTasks(client.maxConcurrentTasks);
}
