import { QueryResultRow } from "pg";
import { readMetadata, toIsoString } from "../../shared/readers.js";
import { selectColumns } from "../sqlColumns.js";
import {
  IntegrationIntakeEvent,
  IntegrationIntakeEventParticipant,
  IntegrationIntakeStatus,
} from "./integrationIntakeEventTypes.js";

export const integrationIntakeEventColumnNames = [
  "id",
  "provider",
  "source_item_id",
  "source_item_key",
  "source_item_url",
  "repository_url",
  "normalized_repository_url",
  "worker_id",
  "transaction_id",
  "status",
  "error_message",
  "metadata",
  "created_at",
  "updated_at",
];

export const integrationIntakeEventColumns = selectColumns(integrationIntakeEventColumnNames);

export function prefixedIntegrationIntakeEventColumns(prefix: string, aliasPrefix = ""): string {
  return selectColumns(integrationIntakeEventColumnNames, prefix, aliasPrefix);
}

export function mapIntegrationIntakeEvent(row: QueryResultRow, prefix = ""): IntegrationIntakeEvent {
  return {
    id: String(row[`${prefix}id`]),
    provider: String(row[`${prefix}provider`]),
    sourceItemId: String(row[`${prefix}source_item_id`]),
    sourceItemKey: String(row[`${prefix}source_item_key`]),
    sourceItemUrl: row[`${prefix}source_item_url`] ? String(row[`${prefix}source_item_url`]) : undefined,
    repositoryUrl: String(row[`${prefix}repository_url`]),
    normalizedRepositoryUrl: String(row[`${prefix}normalized_repository_url`]),
    workerId: row[`${prefix}worker_id`] ? String(row[`${prefix}worker_id`]) : undefined,
    transactionId: row[`${prefix}transaction_id`] ? String(row[`${prefix}transaction_id`]) : undefined,
    status: String(row[`${prefix}status`]) as IntegrationIntakeStatus,
    errorMessage: row[`${prefix}error_message`] ? String(row[`${prefix}error_message`]) : undefined,
    metadata: readMetadata(row[`${prefix}metadata`]),
    createdAt: toIsoString(row[`${prefix}created_at`]),
    updatedAt: toIsoString(row[`${prefix}updated_at`]),
  };
}

export function mapIntegrationIntakeEventParticipant(
  row: QueryResultRow,
  eventId: string
): IntegrationIntakeEventParticipant {
  return {
    eventId,
    userId: String(row.participant_user_id),
    integrationId: String(row.participant_integration_id),
  };
}
