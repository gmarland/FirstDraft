import { normalizeSiteUrl } from "../../integrations/jira/jiraClient.js";
import {
  SaveJiraBoardInput,
  SaveJiraConnectionInput,
  SaveJiraProcessedStatusInput,
  SaveJiraReadyStatusInput,
  SaveJiraWorkflowInput
} from "../../store/integrations/jiraIntegrationStore.js";

export function parseConnectionInput(body: unknown): SaveJiraConnectionInput {
  const payload = body as Record<string, unknown>;
  return {
    siteUrl: readString(payload.siteUrl),
    email: readString(payload.email),
    apiToken: readString(payload.apiToken)
  };
}

export function validateConnectionInput(input: SaveJiraConnectionInput): string | undefined {
  if (!input.siteUrl) return "siteUrl is required";
  if (!input.email) return "email is required";
  if (input.siteUrl) {
    try {
      normalizeSiteUrl(input.siteUrl);
    } catch {
      return "siteUrl must be a valid URL";
    }
  }

  return undefined;
}

export function parseJiraIntakeInput(body: unknown): { integrationId?: string; maxIssues?: number; dryRun?: boolean } {
  const payload = body as Record<string, unknown>;
  const maxIssues = typeof payload.maxIssues === "number" ? payload.maxIssues : undefined;
  return {
    integrationId: readString(payload.integrationId),
    maxIssues,
    dryRun: payload.dryRun === true
  };
}

export function parseBoardInput(body: unknown): SaveJiraBoardInput {
  const payload = body as Record<string, unknown>;
  const boardFilterId = Number(payload.boardFilterId ?? payload.filterId);
  return {
    boardId: Number(payload.boardId ?? payload.id),
    boardName: readString(payload.boardName ?? payload.name) ?? "",
    boardType: readString(payload.boardType ?? payload.type) ?? "",
    boardFilterId: Number.isInteger(boardFilterId) ? boardFilterId : undefined
  };
}

export function validateBoardInput(input: SaveJiraBoardInput): string | undefined {
  if (!Number.isInteger(input.boardId)) return "boardId must be an integer";
  if (!input.boardName) return "boardName is required";
  if (!input.boardType) return "boardType is required";
  return undefined;
}

export function parseReadyStatusInput(body: unknown): SaveJiraReadyStatusInput {
  const payload = body as Record<string, unknown>;
  const readyStatusId = readString(payload.readyStatusId) ?? "";
  const readyStatusName = readString(payload.readyStatusName) ?? "";
  return {
    readyStatusId,
    readyStatusName
  };
}

export function validateReadyStatusInput(input: SaveJiraReadyStatusInput): string | undefined {
  if (!input.readyStatusId) return "readyStatusId is required";
  if (!input.readyStatusName) return "readyStatusName is required";
  return undefined;
}

export function parseWorkflowInput(body: unknown): SaveJiraWorkflowInput {
  const payload = body as Record<string, unknown>;
  const boardInput = parseBoardInput(payload);
  const readyStatusId = readString(payload.readyStatusId) ?? "";
  const readyStatusName = readString(payload.readyStatusName) ?? "";
  return {
    ...boardInput,
    readyStatusId,
    readyStatusName,
    processingStatusId: readString(payload.processingStatusId) ?? "",
    processingStatusName: readString(payload.processingStatusName) ?? "",
    processedStatusId: readString(payload.processedStatusId) ?? "",
    processedStatusName: readString(payload.processedStatusName) ?? "",
    enabled: typeof payload.enabled === "boolean" ? payload.enabled : false
  };
}

export function validateWorkflowInput(input: SaveJiraWorkflowInput): string | undefined {
  const boardError = validateBoardInput(input);
  if (boardError) return boardError;
  const readyStatusError = validateReadyStatusInput(input);
  if (readyStatusError) return readyStatusError;
  if (!input.processingStatusId) return "processingStatusId is required";
  if (!input.processingStatusName) return "processingStatusName is required";
  if (!input.processedStatusId) return "processedStatusId is required";
  if (!input.processedStatusName) return "processedStatusName is required";
  return undefined;
}

export function parseProcessedStatusInput(body: unknown): SaveJiraProcessedStatusInput {
  const payload = body as Record<string, unknown>;
  return {
    processingStatusId: readString(payload.processingStatusId),
    processingStatusName: readString(payload.processingStatusName),
    processedStatusId: readString(payload.processedStatusId),
    processedStatusName: readString(payload.processedStatusName),
    enabled: typeof payload.enabled === "boolean" ? payload.enabled : false
  };
}

export function validateProcessedStatusInput(
  input: SaveJiraProcessedStatusInput,
  settings: { readyStatusId: string; readyStatusName: string }
): string | undefined {
  if (input.enabled) {
    if (!settings.readyStatusId || !settings.readyStatusName) return "ready status is required when Jira is enabled";
    if (!input.processingStatusId) return "processingStatusId is required when Jira is enabled";
    if (!input.processingStatusName) return "processingStatusName is required when Jira is enabled";
    if (!input.processedStatusId) return "processedStatusId is required when Jira is enabled";
    if (!input.processedStatusName) return "processedStatusName is required when Jira is enabled";
  }
  return undefined;
}

export function readEnabled(body: unknown): boolean | undefined {
  return readBoolean((body as Record<string, unknown>).enabled);
}

export function hasCompleteWorkflow(settings: {
  boardId?: number;
  boardName: string;
  boardType: string;
  readyStatusId: string;
  readyStatusName: string;
  processingStatusId: string;
  processingStatusName: string;
  processedStatusId: string;
  processedStatusName: string;
}): boolean {
  return Boolean(
    settings.boardId &&
      settings.boardName &&
      settings.boardType &&
      settings.readyStatusId &&
      settings.readyStatusName &&
      settings.processingStatusId &&
      settings.processingStatusName &&
      settings.processedStatusId &&
      settings.processedStatusName
  );
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
