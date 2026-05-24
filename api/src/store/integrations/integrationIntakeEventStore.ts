import { DbClient } from "../../db/dbClient.js";
import { toIsoString } from "../tenants/tenantRowMappers.js";

type QueryResultRow = Record<string, unknown>;

export type IntegrationIntakeStatus =
  | "queueing"
  | "queued"
  | "processing"
  | "processed"
  | "skipped"
  | "failed";

export type IntegrationIntakeEvent = {
  id: string;
  userId: string;
  provider: string;
  integrationId: string;
  sourceItemId: string;
  sourceItemKey: string;
  sourceItemUrl?: string;
  repositoryUrl: string;
  normalizedRepositoryUrl: string;
  workerId?: string;
  transactionId?: string;
  status: IntegrationIntakeStatus;
  errorMessage?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

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
            user_id,
            provider,
            integration_id,
            source_item_id,
            source_item_key,
            source_item_url,
            repository_url,
            normalized_repository_url,
            metadata,
            status,
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'queueing', now())
          on conflict (provider, integration_id, source_item_key)
            where status in ('queueing', 'queued', 'processing')
          do nothing
          returning ${returningColumns}
        `,
        [
          input.userId,
          input.provider,
          input.integrationId,
          input.sourceItemId,
          input.sourceItemKey,
          input.sourceItemUrl ?? null,
          input.repositoryUrl,
          input.normalizedRepositoryUrl,
          JSON.stringify(input.metadata ?? {})
        ]
      );

      if (result.rows[0]) {
        return { event: mapIntegrationIntakeEvent(result.rows[0]), created: true };
      }

      const existing = await this.getActiveBySourceItem(input.provider, input.integrationId, input.sourceItemKey);
      if (existing) return { event: existing, created: false };
    }

    throw new Error("Integration intake event was not saved");
  }

  public async markQueued(id: string, transactionId: string, workerId?: string): Promise<IntegrationIntakeEvent> {
    return this.update(id, "queued", undefined, workerId, transactionId);
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
        select ${returningColumns}
        from integration_intake_events
        where transaction_id = $1
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
        select ${returningColumns}
        from integration_intake_events
        where provider = $1
          and integration_id = $2
          and source_item_id = $3
        order by created_at desc
        limit 1
      `,
      [provider, integrationId, sourceItemId]
    );

    return result.rows[0] ? mapIntegrationIntakeEvent(result.rows[0]) : undefined;
  }

  private async getActiveBySourceItem(
    provider: string,
    integrationId: string,
    sourceItemKey: string
  ): Promise<IntegrationIntakeEvent | undefined> {
    const result = await this.pool.query(
      `
        select ${returningColumns}
        from integration_intake_events
        where provider = $1
          and integration_id = $2
          and source_item_key = $3
          and status in ('queueing', 'queued', 'processing')
        order by created_at desc
        limit 1
      `,
      [provider, integrationId, sourceItemKey]
    );

    return result.rows[0] ? mapIntegrationIntakeEvent(result.rows[0]) : undefined;
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
        returning ${returningColumns}
      `,
      [id, status, errorMessage ?? null, workerId ?? null, transactionId ?? null]
    );

    if (!result.rows[0]) throw new Error("Integration intake event not found");
    return mapIntegrationIntakeEvent(result.rows[0]);
  }
}

const returningColumns = `
  id,
  user_id,
  provider,
  integration_id,
  source_item_id,
  source_item_key,
  source_item_url,
  repository_url,
  normalized_repository_url,
  worker_id,
  transaction_id,
  status,
  error_message,
  metadata,
  created_at,
  updated_at
`;

function mapIntegrationIntakeEvent(row: QueryResultRow): IntegrationIntakeEvent {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    provider: String(row.provider),
    integrationId: String(row.integration_id),
    sourceItemId: String(row.source_item_id),
    sourceItemKey: String(row.source_item_key),
    sourceItemUrl: row.source_item_url ? String(row.source_item_url) : undefined,
    repositoryUrl: String(row.repository_url),
    normalizedRepositoryUrl: String(row.normalized_repository_url),
    workerId: row.worker_id ? String(row.worker_id) : undefined,
    transactionId: row.transaction_id ? String(row.transaction_id) : undefined,
    status: String(row.status) as IntegrationIntakeStatus,
    errorMessage: row.error_message ? String(row.error_message) : undefined,
    metadata: readMetadata(row.metadata),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
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
