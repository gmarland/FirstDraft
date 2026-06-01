import { QueryResultRow } from "pg";
import { Command } from "../../types.js";
import { toIsoString } from "../tenants/tenantRowMappers.js";
import { selectColumns } from "../sqlColumns.js";

export const commandColumnNames = [
  "transaction_id",
  "user_id",
  "worker_id",
  "command",
  "task_summary",
  "execution_command",
  "command_mode",
  "repository_url",
  "normalized_repository_url",
  "status",
  "result",
  "agent_response",
  "error_message",
  "output_object_key",
  "output_bytes",
  "output_started_at",
  "output_updated_at",
  "created_at",
  "claimed_at",
  "completed_at"
];

export const commandColumns = selectColumns(commandColumnNames);

export function prefixedCommandColumns(prefix: string, aliasPrefix = ""): string {
  return selectColumns(commandColumnNames, prefix, aliasPrefix);
}

export function mapCommand(row: QueryResultRow): Command {
  return {
    transactionId: String(row.transaction_id),
    userId: String(row.user_id),
    workerId: row.worker_id ? String(row.worker_id) : undefined,
    workerOwnerUserId: row.worker_owner_user_id ? String(row.worker_owner_user_id) : undefined,
    workerOwnerName: row.worker_owner_name ? String(row.worker_owner_name) : undefined,
    workerOwnerEmail: row.worker_owner_email ? String(row.worker_owner_email) : undefined,
    command: String(row.command),
    taskSummary: row.task_summary ? String(row.task_summary) : undefined,
    executionCommand: row.execution_command ?? undefined,
    commandMode: "gitflow",
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
