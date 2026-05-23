import { randomUUID } from "crypto";
import { DbClient } from "../../db/dbClient.js";
import { TenantCrypto } from "../../security/tenantCrypto.js";

export type JiraIntegrationSettings = {
  id: string;
  connected: boolean;
  enabled: boolean;
  siteUrl: string;
  email: string;
  boardId?: number;
  boardName: string;
  boardType: string;
  boardFilterId?: number;
  readyStatusId: string;
  readyStatusName: string;
  processingStatusId: string;
  processingStatusName: string;
  processedStatusId: string;
  processedStatusName: string;
  updatedAt?: string;
};

export type SaveJiraConnectionInput = {
  siteUrl?: string;
  email?: string;
  apiToken?: string;
};

export type SaveJiraBoardInput = {
  boardId: number;
  boardName: string;
  boardType: string;
  boardFilterId?: number;
};

export type SaveJiraReadyStatusInput = {
  readyStatusId: string;
  readyStatusName: string;
};

export type SaveJiraProcessedStatusInput = {
  processingStatusId?: string;
  processingStatusName?: string;
  processedStatusId?: string;
  processedStatusName?: string;
  enabled?: boolean;
};

export type SaveJiraWorkflowInput = SaveJiraBoardInput &
  SaveJiraReadyStatusInput &
  Required<
    Pick<
      SaveJiraProcessedStatusInput,
      | "processingStatusId"
      | "processingStatusName"
      | "processedStatusId"
      | "processedStatusName"
    >
  > & {
    enabled?: boolean;
  };

export type SaveJiraIntegrationInput = SaveJiraConnectionInput &
  Partial<SaveJiraBoardInput> &
  Partial<SaveJiraReadyStatusInput> &
  SaveJiraProcessedStatusInput;

export type JiraIntegrationCredentials = JiraIntegrationSettings & {
  userId: string;
  apiToken: string;
};

type JiraIntegrationRow = {
  id: string;
  user_id: string;
  site_url: string | null;
  email: string | null;
  api_token_encrypted: string | null;
  board_id: number | null;
  board_name: string | null;
  board_type: string | null;
  board_filter_id: number | null;
  ready_status_id: string | null;
  ready_status_name: string | null;
  processing_status_id: string | null;
  processing_status_name: string | null;
  processed_status_id: string | null;
  processed_status_name: string | null;
  enabled: boolean;
  updated_at: Date;
};

export class JiraIntegrationStore {
  public constructor(
    private readonly pool: DbClient,
    private readonly crypto: TenantCrypto,
  ) {}

  public async listSettings(
    userId: string,
  ): Promise<JiraIntegrationSettings[]> {
    const result = await this.pool.query<JiraIntegrationRow>(
      `
        select ${returningColumns}
        from tenant_jira_integration
        where user_id = $1
        order by created_at asc
      `,
      [userId],
    );

    return result.rows.map((row) => this.mapSettings(row));
  }

  public async getSettingsForUser(
    userId: string,
    integrationId?: string,
  ): Promise<JiraIntegrationSettings> {
    const row = await this.getRow(userId, integrationId);
    return row ? this.mapSettings(row) : defaultSettings();
  }

  public async getCredentials(
    userId: string,
    integrationId: string,
  ): Promise<JiraIntegrationCredentials | undefined> {
    const row = await this.getRow(userId, integrationId);
    if (!row?.api_token_encrypted || !row.site_url || !row.email)
      return undefined;

    return {
      ...this.mapSettings(row),
      userId: row.user_id,
      apiToken: this.crypto.decrypt(row.api_token_encrypted),
    };
  }

  public async listEnabledCredentials(
    userId: string,
    integrationId?: string,
  ): Promise<JiraIntegrationCredentials[]> {
    const result = await this.pool.query<JiraIntegrationRow>(
      `
        select ${returningColumns}
        from tenant_jira_integration
        where user_id = $1
          and enabled = true
          and site_url is not null
          and email is not null
          and api_token_encrypted is not null
          and ready_status_name is not null
          and ($2::uuid is null or id = $2::uuid)
        order by created_at asc
      `,
      [userId, integrationId ?? null],
    );

    return result.rows.map((row) => ({
      ...this.mapSettings(row),
      userId: row.user_id,
      apiToken: this.crypto.decrypt(row.api_token_encrypted ?? ""),
    }));
  }

  public async listAllEnabledCredentials(
    integrationId?: string,
  ): Promise<JiraIntegrationCredentials[]> {
    const result = await this.pool.query<JiraIntegrationRow>(
      `
        select ${returningColumns}
        from tenant_jira_integration
        where enabled = true
          and site_url is not null
          and email is not null
          and api_token_encrypted is not null
          and ready_status_name is not null
          and ($1::uuid is null or id = $1::uuid)
        order by created_at asc
      `,
      [integrationId ?? null],
    );

    return result.rows.map((row) => ({
      ...this.mapSettings(row),
      userId: row.user_id,
      apiToken: this.crypto.decrypt(row.api_token_encrypted ?? ""),
    }));
  }

  public async saveConnection(
    userId: string,
    input: SaveJiraConnectionInput,
    integrationId?: string,
  ): Promise<JiraIntegrationSettings> {
    const apiTokenEncrypted = input.apiToken?.trim()
      ? this.crypto.encrypt(input.apiToken.trim())
      : undefined;

    const result = await this.pool.query<JiraIntegrationRow>(
      `
        insert into tenant_jira_integration (id, user_id, site_url, email, api_token_encrypted, updated_at)
        values ($1, $2, $3, $4, $5, now())
        on conflict (id) do update
        set site_url = coalesce(excluded.site_url, tenant_jira_integration.site_url),
            email = coalesce(excluded.email, tenant_jira_integration.email),
            api_token_encrypted = coalesce(excluded.api_token_encrypted, tenant_jira_integration.api_token_encrypted),
            updated_at = now()
        where tenant_jira_integration.user_id = excluded.user_id
        returning ${returningColumns}
      `,
      [
        integrationId ?? randomUUID(),
        userId,
        clean(input.siteUrl),
        clean(input.email),
        apiTokenEncrypted ?? null,
      ],
    );

    if (!result.rows[0]) throw new Error("Jira integration not found");
    return this.mapSettings(result.rows[0]);
  }

  public async saveBoard(
    userId: string,
    integrationId: string,
    input: SaveJiraBoardInput,
  ): Promise<JiraIntegrationSettings> {
    const result = await this.pool.query<JiraIntegrationRow>(
      `
        insert into tenant_jira_integration (
          id,
          user_id,
          board_id,
          board_name,
          board_type,
          board_filter_id,
          ready_status_id,
          ready_status_name,
          processing_status_id,
          processing_status_name,
          processed_status_id,
          processed_status_name,
          enabled,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6, null, null, null, null, null, null, false, now())
        on conflict (id) do update
        set board_id = excluded.board_id,
            board_name = excluded.board_name,
            board_type = excluded.board_type,
            board_filter_id = excluded.board_filter_id,
            ready_status_id = null,
            ready_status_name = null,
            processing_status_id = null,
            processing_status_name = null,
            processed_status_id = null,
            processed_status_name = null,
            enabled = false,
            updated_at = now()
        where tenant_jira_integration.user_id = excluded.user_id
        returning ${returningColumns}
      `,
      [
        integrationId,
        userId,
        input.boardId,
        input.boardName,
        input.boardType,
        input.boardFilterId ?? null,
      ],
    );

    if (!result.rows[0]) throw new Error("Jira integration not found");
    return this.mapSettings(result.rows[0]);
  }

  public async saveReadyStatus(
    userId: string,
    integrationId: string,
    input: SaveJiraReadyStatusInput,
  ): Promise<JiraIntegrationSettings> {
    const result = await this.pool.query<JiraIntegrationRow>(
      `
        insert into tenant_jira_integration (
          id,
          user_id,
          ready_status_id,
          ready_status_name,
          processing_status_id,
          processing_status_name,
          processed_status_id,
          processed_status_name,
          enabled,
          updated_at
        )
        values ($1, $2, $3, $4, null, null, null, null, false, now())
        on conflict (id) do update
        set ready_status_id = excluded.ready_status_id,
            ready_status_name = excluded.ready_status_name,
            processing_status_id = null,
            processing_status_name = null,
            processed_status_id = null,
            processed_status_name = null,
            enabled = false,
            updated_at = now()
        where tenant_jira_integration.user_id = excluded.user_id
        returning ${returningColumns}
      `,
      [integrationId, userId, input.readyStatusId, input.readyStatusName],
    );

    if (!result.rows[0]) throw new Error("Jira integration not found");
    return this.mapSettings(result.rows[0]);
  }

  public async saveProcessedStatus(
    userId: string,
    integrationId: string,
    input: SaveJiraProcessedStatusInput,
  ): Promise<JiraIntegrationSettings> {
    const result = await this.pool.query<JiraIntegrationRow>(
      `
        insert into tenant_jira_integration (
          id,
          user_id,
          processing_status_id,
          processing_status_name,
          processed_status_id,
          processed_status_name,
          enabled,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, now())
        on conflict (id) do update
        set processing_status_id = excluded.processing_status_id,
            processing_status_name = excluded.processing_status_name,
            processed_status_id = excluded.processed_status_id,
            processed_status_name = excluded.processed_status_name,
            enabled = excluded.enabled,
            updated_at = now()
        where tenant_jira_integration.user_id = excluded.user_id
        returning ${returningColumns}
      `,
      [
        integrationId,
        userId,
        clean(input.processingStatusId),
        clean(input.processingStatusName),
        clean(input.processedStatusId),
        clean(input.processedStatusName),
        input.enabled ?? false,
      ],
    );

    if (!result.rows[0]) throw new Error("Jira integration not found");
    return this.mapSettings(result.rows[0]);
  }

  public async saveWorkflow(
    userId: string,
    integrationId: string,
    input: SaveJiraWorkflowInput,
  ): Promise<JiraIntegrationSettings> {
    const result = await this.pool.query<JiraIntegrationRow>(
      `
        insert into tenant_jira_integration (
          id,
          user_id,
          board_id,
          board_name,
          board_type,
          board_filter_id,
          ready_status_id,
          ready_status_name,
          processing_status_id,
          processing_status_name,
          processed_status_id,
          processed_status_name,
          enabled,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
        on conflict (id) do update
        set board_id = excluded.board_id,
            board_name = excluded.board_name,
            board_type = excluded.board_type,
            board_filter_id = excluded.board_filter_id,
            ready_status_id = excluded.ready_status_id,
            ready_status_name = excluded.ready_status_name,
            processing_status_id = excluded.processing_status_id,
            processing_status_name = excluded.processing_status_name,
            processed_status_id = excluded.processed_status_id,
            processed_status_name = excluded.processed_status_name,
            enabled = excluded.enabled,
            updated_at = now()
        where tenant_jira_integration.user_id = excluded.user_id
        returning ${returningColumns}
      `,
      [
        integrationId,
        userId,
        input.boardId,
        input.boardName,
        input.boardType,
        input.boardFilterId ?? null,
        input.readyStatusId,
        input.readyStatusName,
        clean(input.processingStatusId),
        clean(input.processingStatusName),
        clean(input.processedStatusId),
        clean(input.processedStatusName),
        input.enabled ?? false,
      ],
    );

    if (!result.rows[0]) throw new Error("Jira integration not found");
    return this.mapSettings(result.rows[0]);
  }

  public async setEnabled(
    userId: string,
    integrationId: string,
    enabled: boolean,
  ): Promise<JiraIntegrationSettings | undefined> {
    const result = await this.pool.query<JiraIntegrationRow>(
      `
        update tenant_jira_integration
        set enabled = $3,
            updated_at = now()
        where id = $1
          and user_id = $2
        returning ${returningColumns}
      `,
      [integrationId, userId, enabled],
    );

    return result.rows[0] ? this.mapSettings(result.rows[0]) : undefined;
  }

  public async save(
    userId: string,
    integrationId: string,
    input: SaveJiraIntegrationInput,
  ): Promise<JiraIntegrationSettings> {
    await this.saveConnection(userId, input, integrationId);
    if (input.boardId && input.boardName && input.boardType) {
      await this.saveBoard(userId, integrationId, {
        boardId: input.boardId,
        boardName: input.boardName,
        boardType: input.boardType,
        boardFilterId: input.boardFilterId,
      });
    }
    if (input.readyStatusId && input.readyStatusName) {
      await this.saveReadyStatus(userId, integrationId, {
        readyStatusId: input.readyStatusId,
        readyStatusName: input.readyStatusName,
      });
    }
    return this.saveProcessedStatus(userId, integrationId, input);
  }

  public async delete(
    userId: string,
    integrationId: string,
  ): Promise<JiraIntegrationSettings | undefined> {
    const result = await this.pool.query<JiraIntegrationRow>(
      `
        delete from tenant_jira_integration
        where id = $1
          and user_id = $2
        returning ${returningColumns}
      `,
      [integrationId, userId],
    );

    return result.rows[0] ? this.mapSettings(result.rows[0]) : undefined;
  }

  private async getRow(
    userId: string,
    integrationId?: string,
  ): Promise<JiraIntegrationRow | undefined> {
    const result = await this.pool.query<JiraIntegrationRow>(
      `
        select ${returningColumns}
        from tenant_jira_integration
        where user_id = $1
          and ($2::uuid is null or id = $2::uuid)
        order by created_at asc
        limit 1
      `,
      [userId, integrationId ?? null],
    );

    return result.rows[0];
  }

  private mapSettings(row: JiraIntegrationRow): JiraIntegrationSettings {
    return {
      id: row.id,
      connected: Boolean(row.site_url && row.email && row.api_token_encrypted),
      enabled: row.enabled,
      siteUrl: row.site_url ?? "",
      email: row.email ?? "",
      boardId: row.board_id ?? undefined,
      boardName: row.board_name ?? "",
      boardType: row.board_type ?? "",
      boardFilterId: row.board_filter_id ?? undefined,
      readyStatusId: row.ready_status_id ?? "",
      readyStatusName: row.ready_status_name ?? "",
      processingStatusId: row.processing_status_id ?? "",
      processingStatusName: row.processing_status_name ?? "",
      processedStatusId: row.processed_status_id ?? "",
      processedStatusName: row.processed_status_name ?? "",
      updatedAt: row.updated_at?.toISOString(),
    };
  }
}

const returningColumns = `
  id,
  user_id,
  site_url,
  email,
  api_token_encrypted,
  board_id,
  board_name,
  board_type,
  board_filter_id,
  ready_status_id,
  ready_status_name,
  processing_status_id,
  processing_status_name,
  processed_status_id,
  processed_status_name,
  enabled,
  updated_at
`;

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function defaultSettings(): JiraIntegrationSettings {
  return {
    connected: false,
    id: "",
    enabled: false,
    siteUrl: "",
    email: "",
    boardName: "",
    boardType: "",
    readyStatusId: "",
    readyStatusName: "",
    processingStatusId: "",
    processingStatusName: "",
    processedStatusId: "",
    processedStatusName: "",
  };
}
