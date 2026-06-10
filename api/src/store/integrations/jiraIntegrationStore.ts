import { DbClient } from "../../db/dbClient.js";
export type JiraIntegrationSettings = {
  id: string;
  workerId?: string;
  connected: boolean;
  enabled: boolean;
  siteUrl: string;
  email: string;
  boardId: number;
  boardName: string;
  boardType: string;
  boardFilterId?: number;
  readyStatusId: string;
  readyStatusName: string;
  processingStatusId: string;
  processingStatusName: string;
  processedStatusId: string;
  processedStatusName: string;
  assignees: JiraIntegrationAssignee[];
  updatedAt?: string;
};

export type JiraIntegrationAssignee = {
  accountId: string;
  displayName: string;
  emailAddress: string;
};

export type WorkerJiraIntegrationInput = {
  integrationId: string;
  enabled: boolean;
  siteUrl: string;
  email: string;
  boardId: number;
  boardName: string;
  boardType: string;
  boardFilterId?: number;
  readyStatusId: string;
  readyStatusName: string;
  processingStatusId: string;
  processingStatusName: string;
  processedStatusId: string;
  processedStatusName: string;
  assignees?: JiraIntegrationAssignee[];
};

type JiraIntegrationRow = {
  worker_id: string;
  integration_id: string;
  user_id: string | null;
  site_url: string;
  email: string;
  board_id: number;
  board_name: string;
  board_type: string;
  board_filter_id: number | null;
  ready_status_id: string;
  ready_status_name: string;
  processing_status_id: string;
  processing_status_name: string;
  processed_status_id: string;
  processed_status_name: string;
  assignee_account_ids: string[];
  assignee_display_names: string[];
  assignee_email_addresses: string[];
  enabled: boolean;
  updated_at: Date;
};

export class JiraIntegrationStore {
  public constructor(private readonly pool: DbClient) {}

  public async syncWorkerIntegrations(
    workerId: string,
    userId: string | null,
    integrations: WorkerJiraIntegrationInput[],
  ): Promise<void> {
    const normalized = normalizeWorkerJiraIntegrationInputs(integrations);
    const integrationIds = normalized.map((integration) => integration.integrationId);

    await this.pool.query(
      `
        delete from worker_jira_integrations
        where worker_id = $1
          and not (integration_id = any($2::text[]))
      `,
      [workerId, integrationIds],
    );

    for (const integration of normalized) {
      await this.pool.query(
        `
          insert into worker_jira_integrations (
            worker_id,
            integration_id,
            user_id,
            site_url,
            email,
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
            assignee_account_ids,
            assignee_display_names,
            assignee_email_addresses,
            enabled,
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, now())
          on conflict (worker_id, integration_id)
          do update set
            user_id = excluded.user_id,
            site_url = excluded.site_url,
            email = excluded.email,
            board_id = excluded.board_id,
            board_name = excluded.board_name,
            board_type = excluded.board_type,
            board_filter_id = excluded.board_filter_id,
            ready_status_id = excluded.ready_status_id,
            ready_status_name = excluded.ready_status_name,
            processing_status_id = excluded.processing_status_id,
            processing_status_name = excluded.processing_status_name,
            processed_status_id = excluded.processed_status_id,
            processed_status_name = excluded.processed_status_name,
            assignee_account_ids = excluded.assignee_account_ids,
            assignee_display_names = excluded.assignee_display_names,
            assignee_email_addresses = excluded.assignee_email_addresses,
            enabled = excluded.enabled,
            updated_at = now()
        `,
        [
          workerId,
          integration.integrationId,
          userId,
          integration.siteUrl,
          integration.email,
          integration.boardId,
          integration.boardName,
          integration.boardType,
          integration.boardFilterId ?? null,
          integration.readyStatusId,
          integration.readyStatusName,
          integration.processingStatusId,
          integration.processingStatusName,
          integration.processedStatusId,
          integration.processedStatusName,
          integration.assignees?.map((assignee) => assignee.accountId) ?? [],
          integration.assignees?.map((assignee) => assignee.displayName) ?? [],
          integration.assignees?.map((assignee) => assignee.emailAddress) ?? [],
          integration.enabled,
        ],
      );
    }
  }

  public async listSettings(userId: string): Promise<JiraIntegrationSettings[]> {
    const result = await this.pool.query<JiraIntegrationRow>(
      `
        select ${returningColumns}
        from worker_jira_integrations
        where user_id = $1
        order by created_at asc
      `,
      [userId],
    );

    return result.rows.map((row) => this.mapSettings(row));
  }

  public async listWorkerSettings(
    userId: string,
    workerId: string,
  ): Promise<JiraIntegrationSettings[]> {
    const result = await this.pool.query<JiraIntegrationRow>(
      `
        select ${returningColumns}
        from worker_jira_integrations
        where user_id = $1
          and worker_id = $2
        order by created_at asc
      `,
      [userId, workerId],
    );

    return result.rows.map((row) => this.mapSettings(row));
  }

  public async listWorkerSettingsForWorker(workerId: string): Promise<JiraIntegrationSettings[]> {
    const result = await this.pool.query<JiraIntegrationRow>(
      `
        select ${returningColumns}
        from worker_jira_integrations
        where worker_id = $1
        order by created_at asc
      `,
      [workerId],
    );

    return result.rows.map((row) => this.mapSettings(row));
  }

  public async listEnabledSettings(
    userId: string,
    integrationId?: string,
  ): Promise<JiraIntegrationSettings[]> {
    const result = await this.pool.query<JiraIntegrationRow>(
      `
        select ${returningColumns}
        from worker_jira_integrations
        where user_id = $1
          and enabled = true
          and ($2::text is null or integration_id = $2::text)
        order by created_at asc
      `,
      [userId, integrationId ?? null],
    );

    return result.rows.map((row) => this.mapSettings(row));
  }

  public async listAllEnabledSettings(
    integrationId?: string,
  ): Promise<JiraIntegrationSettings[]> {
    const result = await this.pool.query<JiraIntegrationRow>(
      `
        select ${returningColumns}
        from worker_jira_integrations
        where enabled = true
          and ($1::text is null or integration_id = $1::text)
        order by created_at asc
      `,
      [integrationId ?? null],
    );

    return result.rows.map((row) => this.mapSettings(row));
  }

  public async getSettings(
    userId: string | null,
    integrationId: string,
    workerId?: string,
  ): Promise<JiraIntegrationSettings | undefined> {
    const result = await this.pool.query<JiraIntegrationRow>(
      `
        select ${returningColumns}
        from worker_jira_integrations
        where user_id is not distinct from $1::uuid
          and integration_id = $2::text
          and ($3::text is null or worker_id = $3)
        order by updated_at desc
        limit 1
      `,
      [userId, integrationId, workerId ?? null],
    );

    return result.rows[0] ? this.mapSettings(result.rows[0]) : undefined;
  }

  private mapSettings(row: JiraIntegrationRow): JiraIntegrationSettings {
    return {
      id: row.integration_id,
      workerId: row.worker_id,
      connected: Boolean(row.site_url && row.email),
      enabled: row.enabled,
      siteUrl: row.site_url,
      email: row.email,
      boardId: row.board_id,
      boardName: row.board_name,
      boardType: row.board_type,
      boardFilterId: row.board_filter_id ?? undefined,
      readyStatusId: row.ready_status_id,
      readyStatusName: row.ready_status_name,
      processingStatusId: row.processing_status_id,
      processingStatusName: row.processing_status_name,
      processedStatusId: row.processed_status_id,
      processedStatusName: row.processed_status_name,
      assignees: row.assignee_account_ids.map((accountId, index) => ({
        accountId,
        displayName: row.assignee_display_names[index] ?? "",
        emailAddress: row.assignee_email_addresses[index] ?? "",
      })),
      updatedAt: row.updated_at?.toISOString(),
    };
  }
}

const returningColumns = `
  worker_id,
  integration_id,
  user_id,
  site_url,
  email,
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
  assignee_account_ids,
  assignee_display_names,
  assignee_email_addresses,
  enabled,
  updated_at
`;

function normalizeWorkerJiraIntegrationInputs(
  integrations: WorkerJiraIntegrationInput[],
): WorkerJiraIntegrationInput[] {
  const byIntegrationId = new Map<string, WorkerJiraIntegrationInput>();

  for (const integration of integrations) {
    const normalized = normalizeWorkerJiraIntegrationInput(integration);
    if (!normalized) continue;
    byIntegrationId.set(normalized.integrationId, normalized);
  }

  return [...byIntegrationId.values()];
}

function normalizeWorkerJiraIntegrationInput(
  integration: WorkerJiraIntegrationInput,
): WorkerJiraIntegrationInput | undefined {
  const integrationId = clean(integration.integrationId);
  if (!isIntegrationId(integrationId)) return undefined;

  const siteUrl = clean(integration.siteUrl).replace(/\/+$/, "");
  const email = clean(integration.email);
  const boardName = clean(integration.boardName);
  const boardType = clean(integration.boardType);
  const readyStatusId = clean(integration.readyStatusId);
  const readyStatusName = clean(integration.readyStatusName);
  const processingStatusId = clean(integration.processingStatusId);
  const processingStatusName = clean(integration.processingStatusName);
  const processedStatusId = clean(integration.processedStatusId);
  const processedStatusName = clean(integration.processedStatusName);
  const assignees = normalizeAssignees(integration.assignees);

  if (
    !siteUrl ||
    !email ||
    !Number.isInteger(integration.boardId) ||
    integration.boardId <= 0 ||
    !boardName ||
    !boardType ||
    !readyStatusId ||
    !readyStatusName ||
    !processingStatusId ||
    !processingStatusName ||
    !processedStatusId ||
    !processedStatusName
  ) {
    return undefined;
  }

  return {
    integrationId,
    enabled: Boolean(integration.enabled),
    siteUrl,
    email,
    boardId: integration.boardId,
    boardName,
    boardType,
    boardFilterId:
      Number.isInteger(integration.boardFilterId) && (integration.boardFilterId ?? 0) > 0
        ? integration.boardFilterId
        : undefined,
    readyStatusId,
    readyStatusName,
    processingStatusId,
    processingStatusName,
    processedStatusId,
    processedStatusName,
    assignees,
  };
}

function clean(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function isIntegrationId(value: string): boolean {
  return /^[a-z0-9]{5}$/.test(value);
}

function normalizeAssignees(value: JiraIntegrationAssignee[] | undefined): JiraIntegrationAssignee[] {
  if (!Array.isArray(value)) return [];

  const byAccountId = new Map<string, JiraIntegrationAssignee>();
  for (const assignee of value) {
    const accountId = clean(assignee.accountId);
    if (!accountId) continue;

    byAccountId.set(accountId, {
      accountId,
      displayName: clean(assignee.displayName),
      emailAddress: clean(assignee.emailAddress),
    });
  }

  return [...byAccountId.values()];
}
