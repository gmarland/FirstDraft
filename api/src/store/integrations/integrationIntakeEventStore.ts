import { DbClient } from "../../db/dbClient.js";
import {
  integrationIntakeEventColumns,
  mapIntegrationIntakeEvent,
  mapIntegrationIntakeEventParticipant,
  prefixedIntegrationIntakeEventColumns,
} from "./integrationIntakeEventRowMappers.js";
import {
  IntegrationIntakeEvent,
  IntegrationIntakeEventParticipant,
  IntegrationIntakeStatus,
} from "./integrationIntakeEventTypes.js";

export type {
  IntegrationIntakeEvent,
  IntegrationIntakeEventParticipant,
  IntegrationIntakeStatus,
} from "./integrationIntakeEventTypes.js";

export type BeginIntegrationIntakeInput = {
  userId: string;
  provider: string;
  integrationId: string;
  sourceItemId: string;
  sourceItemKey: string;
  sourceItemUrl?: string;
  repositoryUrl: string;
  normalizedRepositoryUrl: string;
  metadata?: Record<string, unknown>;
};

export class IntegrationIntakeEventStore {
  public constructor(private readonly pool: DbClient) {}

  public async begin(input: BeginIntegrationIntakeInput): Promise<{ event: IntegrationIntakeEvent; created: boolean }> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await this.pool.query(
        `
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
          values ($1, $2, $3, $4, $5, $6, $7, 'queueing', now())
          on conflict (provider, source_item_url)
            where source_item_url is not null
              and status in ('queueing', 'queued', 'processing')
          do nothing
          returning ${integrationIntakeEventColumns}
        `,
        [
          input.provider,
          input.sourceItemId,
          input.sourceItemKey,
          input.sourceItemUrl ?? null,
          input.repositoryUrl,
          input.normalizedRepositoryUrl,
          JSON.stringify(input.metadata ?? {})
        ]
      );

      if (result.rows[0]) {
        const event = mapIntegrationIntakeEvent(result.rows[0]);
        await this.addParticipant(event.id, input.userId, input.integrationId, event.transactionId);
        return { event, created: true };
      }

      const existing = await this.getActiveBySourceItem(input);
      if (existing) {
        await this.addParticipant(existing.id, input.userId, input.integrationId, existing.transactionId);
        return { event: existing, created: false };
      }
    }

    throw new Error("Integration intake event was not saved");
  }

  public async markQueued(id: string, transactionId: string, workerId?: string): Promise<IntegrationIntakeEvent> {
    const event = await this.update(id, "queued", undefined, workerId, transactionId);
    await this.copyParticipantsToCommand(id, transactionId);
    return event;
  }

  public async markProcessing(id: string, workerId?: string): Promise<IntegrationIntakeEvent> {
    return this.update(id, "processing", undefined, workerId);
  }

  public async markProcessed(id: string): Promise<IntegrationIntakeEvent> {
    return this.update(id, "processed");
  }

  public async markSkipped(id: string, reason: string): Promise<IntegrationIntakeEvent> {
    return this.update(id, "skipped", reason);
  }

  public async markFailed(id: string, reason: string): Promise<IntegrationIntakeEvent> {
    return this.update(id, "failed", reason);
  }

  public async getByTransactionId(transactionId: string): Promise<IntegrationIntakeEvent | undefined> {
    const result = await this.pool.query(
      `
        select ${integrationIntakeEventColumns}
        from integration_intake_events
        where transaction_id = $1
        order by
          case when status in ('queueing', 'queued', 'processing') then 0 else 1 end,
          created_at asc,
          id asc
        limit 1
      `,
      [transactionId]
    );

    return result.rows[0] ? mapIntegrationIntakeEvent(result.rows[0]) : undefined;
  }

  public async getBySourceItemId(
    provider: string,
    integrationId: string,
    sourceItemId: string
  ): Promise<IntegrationIntakeEvent | undefined> {
    const result = await this.pool.query(
      `
        select ${integrationIntakeEventColumns}
          from integration_intake_events
        where provider = $1
          and source_item_id = $2
        order by created_at desc
        limit 1
      `,
      [provider, sourceItemId]
    );

    return result.rows[0] ? mapIntegrationIntakeEvent(result.rows[0]) : undefined;
  }

  public async getByIdForWorker(
    id: string,
    workerId: string,
    userId: string
  ): Promise<{ event: IntegrationIntakeEvent; participant: IntegrationIntakeEventParticipant } | undefined> {
    const result = await this.pool.query(
      `
        select
          ${prefixedIntegrationIntakeEventColumns("events")},
          participants.user_id as participant_user_id,
          participants.integration_id as participant_integration_id
        from integration_intake_events events
        inner join integration_intake_event_users participants
          on participants.event_id = events.id
          and participants.user_id = $3
        where events.id = $1
          and events.worker_id = $2
        order by participants.created_at asc, participants.integration_id asc
        limit 1
      `,
      [id, workerId, userId]
    );

    return result.rows[0]
      ? {
          event: mapIntegrationIntakeEvent(result.rows[0]),
          participant: mapIntegrationIntakeEventParticipant(result.rows[0], id),
        }
      : undefined;
  }

  public async getParticipantForWorker(
    transactionId: string,
    workerId: string
  ): Promise<IntegrationIntakeEventParticipant | undefined> {
    const result = await this.pool.query(
      `
        select
          events.id as event_id,
          participants.user_id,
          participants.integration_id
        from integration_intake_events events
        inner join client_commands commands
          on commands.transaction_id = events.transaction_id
        inner join client_workers worker
          on worker.worker_id = $2
          and worker.worker_id = commands.worker_id
        inner join integration_intake_event_users participants
          on participants.event_id = events.id
          and participants.user_id = worker.user_id
        where events.transaction_id = $1
        order by participants.created_at asc, participants.integration_id asc
        limit 1
      `,
      [transactionId, workerId]
    );

    return result.rows[0]
      ? {
          eventId: String(result.rows[0].event_id),
          userId: String(result.rows[0].user_id),
          integrationId: String(result.rows[0].integration_id),
        }
      : undefined;
  }

  private async getActiveBySourceItem(input: BeginIntegrationIntakeInput): Promise<IntegrationIntakeEvent | undefined> {
    if (input.sourceItemUrl) {
      const result = await this.pool.query(
        `
          select ${integrationIntakeEventColumns}
          from integration_intake_events
          where provider = $1
            and source_item_url = $2
            and status in ('queueing', 'queued', 'processing')
          order by created_at asc, id asc
          limit 1
        `,
        [input.provider, input.sourceItemUrl]
      );

      return result.rows[0] ? mapIntegrationIntakeEvent(result.rows[0]) : undefined;
    }

    const result = await this.pool.query(
      `
        select ${integrationIntakeEventColumns}
        from integration_intake_events
        where provider = $1
          and source_item_key = $2
          and status in ('queueing', 'queued', 'processing')
        order by created_at desc
        limit 1
      `,
      [input.provider, input.sourceItemKey]
    );

    return result.rows[0] ? mapIntegrationIntakeEvent(result.rows[0]) : undefined;
  }

  private async addParticipant(
    eventId: string,
    userId: string,
    integrationId: string,
    transactionId?: string
  ): Promise<void> {
    await this.pool.query(
      `
        insert into integration_intake_event_users (event_id, user_id, integration_id)
        values ($1, $2, $3)
        on conflict do nothing
      `,
      [eventId, userId, integrationId]
    );

    if (!transactionId) return;

    await this.pool.query(
      `
        insert into client_command_users (transaction_id, user_id)
        values ($1, $2)
        on conflict do nothing
      `,
      [transactionId, userId]
    );
  }

  private async copyParticipantsToCommand(eventId: string, transactionId: string): Promise<void> {
    await this.pool.query(
      `
        insert into client_command_users (transaction_id, user_id)
        select $2, user_id
        from integration_intake_event_users
        where event_id = $1
        on conflict do nothing
      `,
      [eventId, transactionId]
    );
  }

  private async update(
    id: string,
    status: IntegrationIntakeStatus,
    errorMessage?: string,
    workerId?: string,
    transactionId?: string
  ): Promise<IntegrationIntakeEvent> {
    const result = await this.pool.query(
      `
        update integration_intake_events
        set status = $2,
          error_message = $3,
          worker_id = coalesce($4, worker_id),
          transaction_id = coalesce($5, transaction_id),
          updated_at = now()
        where id = $1
          and (
            $4::text is null
            or exists (
              select 1
              from client_commands commands
              inner join client_workers assigned_worker
                on assigned_worker.worker_id = $4
                and assigned_worker.worker_id = commands.worker_id
              inner join client_command_users command_users
                on command_users.transaction_id = commands.transaction_id
              where commands.transaction_id = coalesce($5, integration_intake_events.transaction_id)
                and command_users.user_id = assigned_worker.user_id
            )
          )
        returning ${integrationIntakeEventColumns}
      `,
      [id, status, errorMessage ?? null, workerId ?? null, transactionId ?? null]
    );

    if (!result.rows[0]) throw new Error("Integration intake event not found");
    return mapIntegrationIntakeEvent(result.rows[0]);
  }
}
