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
      reason?: string;
    };

export class JiraTicketClaimStore {
  public constructor(private readonly pool: DbClient) {}

  public async claim(input: ClaimJiraTicketInput): Promise<ClaimJiraTicketResult> {
    await this.expireStaleActiveClaim(input.sourceItemUrl);

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
                and (
                  active_commands.claimed_at is null
                  or active_commands.claimed_at >= now() - ($13::int * interval '1 minute')
                )
            ) < workers.max_concurrent_tasks
            and exists (
              select 1
              from worker_git_repositories repositories
              where repositories.worker_id = integrations.worker_id
                and repositories.normalized_repository_url = $8
            )
          limit 1
        ),
        active_event as (
          select ${prefixedEventReturningColumns("events")}
          from integration_intake_events events
          where events.provider = 'jira'
            and events.source_item_url = $6
            and events.status in ('queueing', 'queued', 'processing')
          order by events.created_at asc, events.id asc
          limit 1
          for update of events
        ),
        claimable_existing_event as (
          select *
          from active_event
          where not exists (
            select 1
            from client_commands active_commands
            where active_commands.transaction_id = active_event.transaction_id
              and active_commands.status = 'in_progress'
          )
        ),
        updated_existing_event as (
          update integration_intake_events events
          set status = 'processing',
            worker_id = worker_integration.worker_id,
            transaction_id = $10,
            updated_at = now()
          from claimable_existing_event, worker_integration
          where events.id = claimable_existing_event.id
          returning ${prefixedEventReturningColumns("events")}
        ),
        inserted_event as (
          insert into integration_intake_events (
            provider,
            source_item_id,
            source_item_key,
            source_item_url,
            repository_url,
            normalized_repository_url,
            worker_id,
            transaction_id,
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
            worker_integration.worker_id,
            $10,
            $9::jsonb,
            'processing',
            now()
          from worker_integration
          where not exists (select 1 from active_event)
          on conflict (provider, source_item_url)
            where source_item_url is not null
              and status in ('queueing', 'queued', 'processing')
          do nothing
          returning ${eventReturningColumns}
        ),
        claim_event as (
          select *
          from updated_existing_event
          union all
          select *
          from inserted_event
          limit 1
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
          inner join claim_event on true
          returning ${commandReturningColumns}
        ),
        event_participant as (
          insert into integration_intake_event_users (event_id, user_id, integration_id)
          select claim_event.id, $2, $3
          from claim_event
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
          ${prefixedEventReturningColumns("claim_event", "event_")}
        from created_command
        inner join claim_event on true
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
        staleClaimTimeoutMinutes,
      ],
    );

    if (result.rows[0]) {
      return {
        claimed: true,
        command: mapCommand(result.rows[0]),
        event: mapEvent(result.rows[0], "event_"),
      };
    }

    const event = await this.getActiveJiraEvent(input.sourceItemUrl);
    return {
      claimed: false,
      event,
      reason: event ? "Jira issue already has an active intake event" : await this.getClaimRejectionReason(input),
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

  private async getClaimRejectionReason(input: ClaimJiraTicketInput): Promise<string> {
    const result = await this.pool.query(
      `
        select
          workers.worker_id is not null as worker_exists,
          coalesce(workers.enabled, false) as worker_enabled,
          integrations.integration_id is not null as integration_exists,
          coalesce(integrations.enabled, false) as integration_enabled,
          coalesce('gitflow' = any(workers.enabled_task_types), false) as gitflow_enabled,
          coalesce('git' = any(workers.skills), false) as git_skill_enabled,
          exists (
            select 1
            from worker_git_repositories repositories
            where repositories.worker_id = $1
              and repositories.normalized_repository_url = $4
          ) as repository_configured,
          coalesce(workers.max_concurrent_tasks, 0) as max_concurrent_tasks,
          (
            select count(*)::int
            from client_commands active_commands
            where active_commands.worker_id = $1
              and active_commands.status = 'in_progress'
              and (
                active_commands.claimed_at is null
                or active_commands.claimed_at >= now() - ($5::int * interval '1 minute')
              )
          ) as active_command_count
        from (select 1) seed
        left join client_workers workers
          on workers.worker_id = $1
          and workers.user_id = $2
        left join worker_jira_integrations integrations
          on integrations.worker_id = $1
          and integrations.user_id = $2
          and integrations.integration_id = $3
        limit 1
      `,
      [
        input.workerId,
        input.userId,
        input.integrationId,
        input.normalizedRepositoryUrl,
        staleClaimTimeoutMinutes,
      ],
    );

    const row = result.rows[0];
    if (!row?.worker_exists) return "worker is not registered for this user";
    if (!row.worker_enabled) return "worker is disabled";
    if (!row.integration_exists) return "Jira integration is not registered for this worker";
    if (!row.integration_enabled) return "Jira integration is disabled";
    if (!row.gitflow_enabled) return "worker is not enabled for gitflow tasks";
    if (!row.git_skill_enabled) return "worker does not advertise the git skill";
    if (!row.repository_configured) return "worker is not configured for this repository";

    const activeCommandCount = Number(row.active_command_count ?? 0);
    const maxConcurrentTasks = Number(row.max_concurrent_tasks ?? 0);
    if (activeCommandCount >= maxConcurrentTasks) {
      return `worker has no available capacity (${activeCommandCount}/${maxConcurrentTasks} active gitflow tasks)`;
    }

    return "worker is not eligible to claim this Jira issue";
  }

  private async expireStaleActiveClaim(sourceItemUrl: string): Promise<void> {
    await this.pool.query(
      `
        with stale_events as (
          select events.id,
            events.transaction_id
          from integration_intake_events events
          left join client_commands commands
            on commands.transaction_id = events.transaction_id
          where events.provider = 'jira'
            and events.source_item_url = $1
            and events.status in ('queueing', 'queued', 'processing')
            and (
              (events.status = 'processing' and (events.worker_id is null or events.transaction_id is null))
              or
              events.updated_at < now() - ($2::int * interval '1 minute')
              or (
                commands.status = 'in_progress'
                and commands.claimed_at is not null
                and commands.claimed_at < now() - ($2::int * interval '1 minute')
              )
            )
        ),
        failed_commands as (
          update client_commands commands
          set status = 'failed',
            error_message = $3,
            completed_at = now()
          from stale_events
          where commands.transaction_id = stale_events.transaction_id
            and commands.status in ('queued', 'in_progress')
        )
        update integration_intake_events events
        set status = 'failed',
          error_message = $3,
          updated_at = now()
        from stale_events
        where events.id = stale_events.id
      `,
      [
        sourceItemUrl,
        staleClaimTimeoutMinutes,
        `Jira ticket claim expired after ${staleClaimTimeoutMinutes} minutes without completion.`,
      ],
    );
  }
}

const staleClaimTimeoutMinutes = 30;

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
