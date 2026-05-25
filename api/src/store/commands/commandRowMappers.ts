import { QueryResultRow } from "pg";
import { Command } from "../../types.js";
import { toIsoString } from "../tenants/tenantRowMappers.js";

export function mapCommand(row: QueryResultRow): Command {
  return {
    transactionId: String(row.transaction_id),
    userId: String(row.user_id),
    workerId: row.worker_id ? String(row.worker_id) : undefined,
    command: String(row.command),
    taskSummary: row.task_summary ? String(row.task_summary) : undefined,
    executionCommand: row.execution_command ?? undefined,
    commandMode: row.command_mode === "shell" || row.command_mode === "gitflow" ? row.command_mode : "ai",
    repositoryUrl: row.repository_url ? String(row.repository_url) : undefined,
    normalizedRepositoryUrl: row.normalized_repository_url ? String(row.normalized_repository_url) : undefined,
    sourceProvider: row.source_provider ? String(row.source_provider) : undefined,
    sourceItemId: row.source_item_id ? String(row.source_item_id) : undefined,
    sourceItemKey: row.source_item_key ? String(row.source_item_key) : undefined,
    sourceItemUrl: row.source_item_url ? String(row.source_item_url) : undefined,
    status: row.status,
    createdAt: toIsoString(row.created_at),
    claimedAt: row.claimed_at ? toIsoString(row.claimed_at) : undefined,
    completedAt: row.completed_at ? toIsoString(row.completed_at) : undefined,
    result: row.result ?? undefined,
    agentResponse: row.agent_response ?? undefined,
    errorMessage: row.error_message ?? undefined,
    outputObjectKey: row.output_object_key ? String(row.output_object_key) : undefined,
    outputBytes: row.output_bytes === null || row.output_bytes === undefined ? undefined : Number(row.output_bytes),
    outputStartedAt: row.output_started_at ? toIsoString(row.output_started_at) : undefined,
    outputUpdatedAt: row.output_updated_at ? toIsoString(row.output_updated_at) : undefined
  };
}
