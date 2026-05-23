import { SaveGitRepositoryInput } from "../../store/gitRepositories/gitRepositoryStore.js";

export function parseRepositoryInput(body: unknown, partial = false): SaveGitRepositoryInput {
  const payload = body as Record<string, unknown>;
  return {
    repositoryUrl: readString(payload, "repositoryUrl") || (partial ? undefined : ""),
    defaultSourceBranch: readString(payload, "defaultSourceBranch"),
    defaultTargetBranch: readString(payload, "defaultTargetBranch"),
    enabled: typeof payload.enabled === "boolean" ? payload.enabled : undefined
  };
}

export function validateRepositoryInput(input: SaveGitRepositoryInput, partial = false): string | undefined {
  if (!partial && !input.repositoryUrl?.trim()) return "repositoryUrl is required";
  return undefined;
}

function readString(body: unknown, field: string): string | undefined {
  const payload = body as Record<string, unknown>;
  const value = payload?.[field];
  return typeof value === "string" ? value.trim() : undefined;
}
