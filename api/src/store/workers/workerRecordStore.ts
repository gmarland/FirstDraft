import { DbClient } from "../../db/dbClient.js";
import { toIsoString } from "../tenants/tenantRowMappers.js";

type QueryResultRow = Record<string, unknown>;

export type WorkerRecord = {
  workerId: string;
  apiKeyId?: string;
  firstRegisteredAt: string;
  lastRegisteredAt: string;
  lastSeenAt?: string;
  lastConnectionId?: string;
  paths: string[];
  skills: string[];
  maxConcurrentTasks: number;
};

export type UpsertWorkerRegistrationInput = {
  workerId: string;
  apiKeyId: string;
  connectionId: string;
  paths: string[];
  skills: string[];
  maxConcurrentTasks?: number;
};

export class WorkerRecordStore {
  public constructor(private readonly pool: DbClient) {}

  public async listWorkers(): Promise<WorkerRecord[]> {
    const result = await this.pool.query(
      `
        select worker_id, api_key_id, first_registered_at, last_registered_at, last_seen_at, last_connection_id, paths, skills, max_concurrent_tasks
        from client_workers
        order by coalesce(last_seen_at, last_registered_at, first_registered_at) desc
      `
    );

    return result.rows.map(mapWorkerRecord);
  }

  public async listWorkersForUser(userId: string): Promise<WorkerRecord[]> {
    const result = await this.pool.query(
      `
        select client_workers.worker_id, client_workers.api_key_id, client_workers.first_registered_at, client_workers.last_registered_at, client_workers.last_seen_at, client_workers.last_connection_id, client_workers.paths, client_workers.skills, client_workers.max_concurrent_tasks
        from client_workers
        inner join api_keys on api_keys.id = client_workers.api_key_id
        where api_keys.user_id = $1
        order by coalesce(client_workers.last_seen_at, client_workers.last_registered_at, client_workers.first_registered_at) desc
      `,
      [userId]
    );

    return result.rows.map(mapWorkerRecord);
  }

  public async getWorker(workerId: string): Promise<WorkerRecord | undefined> {
    const result = await this.pool.query(
      `
        select worker_id, api_key_id, first_registered_at, last_registered_at, last_seen_at, last_connection_id, paths, skills, max_concurrent_tasks
        from client_workers
        where worker_id = $1
      `,
      [workerId]
    );

    return result.rows[0] ? mapWorkerRecord(result.rows[0]) : undefined;
  }

  public async getWorkerForUser(userId: string, workerId: string): Promise<WorkerRecord | undefined> {
    const result = await this.pool.query(
      `
        select client_workers.worker_id, client_workers.api_key_id, client_workers.first_registered_at, client_workers.last_registered_at, client_workers.last_seen_at, client_workers.last_connection_id, client_workers.paths, client_workers.skills, client_workers.max_concurrent_tasks
        from client_workers
        inner join api_keys on api_keys.id = client_workers.api_key_id
        where api_keys.user_id = $1 and client_workers.worker_id = $2
      `,
      [userId, workerId]
    );

    return result.rows[0] ? mapWorkerRecord(result.rows[0]) : undefined;
  }

  public async upsertWorkerRegistration(input: UpsertWorkerRegistrationInput): Promise<WorkerRecord> {
    const result = await this.pool.query(
      `
        insert into client_workers (worker_id, api_key_id, first_registered_at, last_registered_at, last_seen_at, last_connection_id, paths, skills, max_concurrent_tasks)
        values ($1, $2, now(), now(), now(), $3, $4, $5, $6)
        on conflict (worker_id)
        do update set
          api_key_id = excluded.api_key_id,
          last_registered_at = now(),
          last_seen_at = now(),
          last_connection_id = excluded.last_connection_id,
          paths = excluded.paths,
          skills = excluded.skills,
          max_concurrent_tasks = excluded.max_concurrent_tasks
        returning worker_id, api_key_id, first_registered_at, last_registered_at, last_seen_at, last_connection_id, paths, skills, max_concurrent_tasks
      `,
      [input.workerId, input.apiKeyId, input.connectionId, input.paths, input.skills, normalizeMaxConcurrentTasks(input.maxConcurrentTasks)]
    );

    return mapWorkerRecord(result.rows[0]);
  }
}

function mapWorkerRecord(row: QueryResultRow): WorkerRecord {
  return {
    workerId: String(row.worker_id),
    apiKeyId: row.api_key_id ? String(row.api_key_id) : undefined,
    firstRegisteredAt: toIsoString(row.first_registered_at),
    lastRegisteredAt: toIsoString(row.last_registered_at),
    lastSeenAt: row.last_seen_at ? toIsoString(row.last_seen_at) : undefined,
    lastConnectionId: row.last_connection_id ? String(row.last_connection_id) : undefined,
    paths: Array.isArray(row.paths) ? row.paths.map(String) : [],
    skills: Array.isArray(row.skills) ? row.skills.map(String) : [],
    maxConcurrentTasks: normalizeMaxConcurrentTasks(Number(row.max_concurrent_tasks))
  };
}

function normalizeMaxConcurrentTasks(value: unknown): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 1;
  return Math.max(1, Math.min(8, numeric));
}
