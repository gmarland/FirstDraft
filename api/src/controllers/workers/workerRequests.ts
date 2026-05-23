import { CommandMode } from "../../types.js";

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
