import { CommandMode, CommandStatus } from "../../types.js";
import type { TaskQueueSortBy, TaskQueueSortDirection } from "../../store/clientStore.js";

export const DEFAULT_TASK_QUEUE_STATUSES: CommandStatus[] = ["queued", "in_progress"];

const commandStatuses = new Set<CommandStatus>(["queued", "in_progress", "completed", "failed"]);
const taskQueueSortFields = new Set<TaskQueueSortBy>(["status", "source", "task", "worker", "repository", "created"]);

export function parseCommandMode(value: string | undefined): CommandMode | undefined {
  if (value === undefined) return "ai";
  if (value === "ai" || value === "shell" || value === "gitflow") return value;
  return undefined;
}

export function parseGitflowPayload(command: string): { repositoryUrl: string; sourceBranch: string; targetBranch?: string } | undefined {
  try {
    const payload = JSON.parse(command) as { repositoryUrl?: unknown; sourceBranch?: unknown; targetBranch?: unknown };
    const repositoryUrl = typeof payload.repositoryUrl === "string" ? payload.repositoryUrl.trim() : "";
    const sourceBranch = typeof payload.sourceBranch === "string" ? payload.sourceBranch.trim() : "";
    const targetBranch = typeof payload.targetBranch === "string" ? payload.targetBranch.trim() : "";
    if (!repositoryUrl || !sourceBranch) return undefined;
    return targetBranch ? { repositoryUrl, sourceBranch, targetBranch } : { repositoryUrl, sourceBranch };
  } catch {
    return undefined;
  }
}

export function getMissingSkills(workerSkills: string[], commandMode: CommandMode): string[] {
  const requiredSkills = commandMode === "gitflow" ? ["git"] : [];
  const normalizedWorkerSkills = new Set((workerSkills ?? []).map((skill) => skill.toLowerCase()));
  return requiredSkills.filter((skill) => !normalizedWorkerSkills.has(skill));
}

export function readCancelReason(body: unknown): string {
  const payload = body as { reason?: unknown };
  const reason = typeof payload?.reason === "string" ? payload.reason.trim() : "";
  return reason || "command cancelled from UI";
}

export function readWorkerEnabled(body: unknown): boolean | undefined {
  const payload = body as { enabled?: unknown };
  return typeof payload?.enabled === "boolean" ? payload.enabled : undefined;
}

export function readTaskQueueStatuses(query: Record<string, unknown>): CommandStatus[] {
  const rawStatus = query.status;
  const requestedStatuses = Array.isArray(rawStatus) ? rawStatus : [rawStatus];
  const statuses: CommandStatus[] = [];

  for (const status of requestedStatuses) {
    if (typeof status !== "string" || !commandStatuses.has(status as CommandStatus)) continue;
    if (!statuses.includes(status as CommandStatus)) statuses.push(status as CommandStatus);
  }

  return statuses.length > 0 ? statuses : DEFAULT_TASK_QUEUE_STATUSES;
}

export function readTaskQueueSort(query: Record<string, unknown>): { sortBy?: TaskQueueSortBy; sortDirection?: TaskQueueSortDirection } {
  const sortBy = typeof query.sortBy === "string" && taskQueueSortFields.has(query.sortBy as TaskQueueSortBy)
    ? query.sortBy as TaskQueueSortBy
    : undefined;
  const sortDirection = query.sortDirection === "desc" ? "desc" : query.sortDirection === "asc" ? "asc" : undefined;

  if (!sortBy || !sortDirection) return {};
  return { sortBy, sortDirection };
}
