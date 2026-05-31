import { nanoid } from "nanoid";
import { DbClient } from "../../db/dbClient.js";
import { Command } from "../../types.js";
import { buildTaskSummary } from "../commands/commandSummary.js";
import { mapCommand } from "../commands/commandRowMappers.js";
import { IntegrationIntakeEvent } from "./integrationIntakeEventStore.js";

export type ClaimJiraTicketInput = {
  workerId: string;
  userId: string;
  integrationId: string;
  sourceItemId: string;
  sourceItemKey: string;
  sourceItemUrl: string;
  repositoryUrl: string;
  normalizedRepositoryUrl: string;
  command: string;
  metadata?: Record<string, unknown>;
};

export type ClaimJiraTicketResult =
  | {
      claimed: true;
      command: Command;
      event: IntegrationIntakeEvent;
    }
  | {
      claimed: false;
      event?: IntegrationIntakeEvent;
    };

export class JiraTicketClaimStore {
  public constructor(private readonly pool: DbClient) {}

  public async claim(input: ClaimJiraTicketInput): Promise<ClaimJiraTicketResult> {
    const transactionId = nanoid();
    const result = await this.pool.query(
      `
        with worker_integration as (
          select
            integrations.worker_id,
            integrations.user_id,
            integrations.integration_id
          from worker_jira_integrations integrations
          inner join client_workers workers
            on workers.worker_id = integrations.worker_id
            and workers.user_id = integrations.user_id
          where integrations.worker_id = $1
            and integrations.user_id = $2
            and integrations.integration_id = $3
            and integrations.enabled = true
            and workers.enabled = true
            and 'gitflow' = any(workers.enabled_task_types)
            and 'git' = any(workers.skills)
            and (
              select count(*)
              from client_commands active_commands
              where active_commands.worker_id = workers.worker_id
                and active_commands.status = 'in_progress'
            ) < workers.max_concurrent_tasks
            and exists (
              select 1
              from worker_git_repositories repositories
              where repositories.worker_id = integrations.worker_id
                and repositories.normalized_repository_url = $8
            )
          limit 1
        ),
        created_event as (
          insert into integration_intake_events (
            provider,
            source_item_id,
            source_item_key,
            source_item_url,
            repository_url,
            normalized_repository_url,
            metadata,
            status,
            updated_at
          )
          select
            'jira',
            $4,
            $5,
            $6,
            $7,
            $8,
            $9::jsonb,
            'queueing',
            now()
          from worker_integration
          on conflict (provider, source_item_url)
            where source_item_url is not null
              and status in ('queueing', 'queued', 'processing')
          do nothing
          returning ${eventReturningColumns}
        ),
        created_command as (
          insert into client_commands (
            transaction_id,
            user_id,
            worker_id,
            command,
            task_summary,
            execution_command,
            command_mode,
            repository_url,
            normalized_repository_url,
            status,
            claimed_at
          )
          select
            $10,
            worker_integration.user_id,
            worker_integration.worker_id,
            $11,
            $12,
            $11,
            'gitflow',
            $7,
            $8,
            'in_progress',
            now()
          from worker_integration
          inner join created_event on true
          returning ${commandReturningColumns}
        ),
        updated_event as (
          update integration_intake_events events
          set status = 'processing',
            worker_id = created_command.worker_id,
            transaction_id = created_command.transaction_id,
            updated_at = now()
          from created_event, created_command
          where events.id = created_event.id
          returning ${prefixedEventReturningColumns("events")}
        ),
        event_participant as (
          insert into integration_intake_event_users (event_id, user_id, integration_id)
          select updated_event.id, $2, $3
          from updated_event
          on conflict do nothing
        ),
        command_participant as (
          insert into client_command_users (transaction_id, user_id)
          select created_command.transaction_id, $2
          from created_command
          on conflict do nothing
        )
        select
          ${prefixedCommandReturningColumns("created_command")},
          ${prefixedEventReturningColumns("updated_event", "event_")}
        from created_command
        inner join updated_event on true
      `,
      [
        input.workerId,
        input.userId,
        input.integrationId,
        input.sourceItemId,
        input.sourceItemKey,
        input.sourceItemUrl,
        input.repositoryUrl,
        input.normalizedRepositoryUrl,
        JSON.stringify(input.metadata ?? {}),
        transactionId,
        input.command,
        buildTaskSummary(input.command, "gitflow"),
      ],
    );

    if (result.rows[0]) {
      return {
        claimed: true,
        command: mapCommand(result.rows[0]),
        event: mapEvent(result.rows[0], "event_"),
      };
    }

    return {
      claimed: false,
      event: await this.getActiveJiraEvent(input.sourceItemUrl),
    };
  }

  private async getActiveJiraEvent(sourceItemUrl: string): Promise<IntegrationIntakeEvent | undefined> {
    const result = await this.pool.query(
      `
        select ${eventReturningColumns}
        from integration_intake_events
        where provider = 'jira'
          and source_item_url = $1
          and status in ('queueing', 'queued', 'processing')
        order by created_at asc, id asc
        limit 1
      `,
      [sourceItemUrl],
    );

    return result.rows[0] ? mapEvent(result.rows[0]) : undefined;
  }
}

const commandColumnNames = [
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
  "completed_at",
];

const eventColumnNames = [
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

const commandReturningColumns = commandColumnNames.join(", ");
const eventReturningColumns = eventColumnNames.join(", ");

function prefixedCommandReturningColumns(prefix: string): string {
  return commandColumnNames.map((column) => `${prefix}.${column}`).join(", ");
}

function prefixedEventReturningColumns(prefix: string, aliasPrefix = ""): string {
  return eventColumnNames
    .map((column) => `${prefix}.${column} as ${aliasPrefix}${column}`)
    .join(", ");
}

function mapEvent(row: Record<string, unknown>, prefix = ""): IntegrationIntakeEvent {
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
    status: String(row[`${prefix}status`]) as IntegrationIntakeEvent["status"],
    errorMessage: row[`${prefix}error_message`] ? String(row[`${prefix}error_message`]) : undefined,
    metadata: readMetadata(row[`${prefix}metadata`]),
    createdAt: toIsoString(row[`${prefix}created_at`]),
    updatedAt: toIsoString(row[`${prefix}updated_at`]),
  };
}

function readMetadata(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return isPlainObject(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return isPlainObject(value) ? value : {};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return new Date(value).toISOString();
  return new Date().toISOString();
}
