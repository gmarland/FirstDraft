import type { ClientState, CommandMode } from "../../types.js";
import { normalizeEnabledTaskTypes } from "../../commandModes.js";
import { DbClient } from "../../db/dbClient.js";
import { toIsoString } from "../tenants/tenantRowMappers.js";

type QueryResultRow = Record<string, unknown>;

export type WorkerRecord = {
  workerId: string;
  userId: string;
  firstRegisteredAt: string;
  lastRegisteredAt: string;
  lastSeenAt?: string;
  lastConnectionId?: string;
  paths: string[];
  skills: string[];
  enabled: boolean;
  enabledTaskTypes: CommandMode[];
  maxConcurrentTasks: number;
  state: ClientState;
  stateUpdatedAt: string;
  stoppedAt?: string;
};

export type UpsertWorkerRegistrationInput = {
  workerId: string;
  userId: string;
  connectionId: string;
  paths: string[];
  skills: string[];
  enabledTaskTypes?: CommandMode[];
  maxConcurrentTasks?: number;
};

export class WorkerRecordStore {
  public constructor(private readonly pool: DbClient) {}

  public async listWorkers(): Promise<WorkerRecord[]> {
    const result = await this.pool.query(
      `
        select ${workerRecordColumns}
        from client_workers
        order by coalesce(state_updated_at, last_seen_at, last_registered_at, first_registered_at) desc
      `
    );

    return result.rows.map(mapWorkerRecord);
  }

  public async listWorkersForUser(userId: string): Promise<WorkerRecord[]> {
    const result = await this.pool.query(
      `
        select ${prefixedWorkerRecordColumns}
        from client_workers
        where client_workers.user_id = $1
        order by coalesce(client_workers.state_updated_at, client_workers.last_seen_at, client_workers.last_registered_at, client_workers.first_registered_at) desc
      `,
      [userId]
    );

    return result.rows.map(mapWorkerRecord);
  }

  public async getWorker(workerId: string): Promise<WorkerRecord | undefined> {
    const result = await this.pool.query(
      `
        select ${workerRecordColumns}
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
        select ${prefixedWorkerRecordColumns}
        from client_workers
        where client_workers.user_id = $1 and client_workers.worker_id = $2
      `,
      [userId, workerId]
    );

    return result.rows[0] ? mapWorkerRecord(result.rows[0]) : undefined;
  }

  public async upsertWorkerRegistration(input: UpsertWorkerRegistrationInput): Promise<WorkerRecord> {
    const result = await this.pool.query(
      `
        insert into client_workers (
          worker_id, user_id, first_registered_at, last_registered_at, last_seen_at,
          last_connection_id, paths, skills, enabled_task_types, max_concurrent_tasks, state, state_updated_at, stopped_at
        )
        values ($1, $2, now(), now(), now(), $3, $4, $5, $6, $7, 'started', now(), null)
        on conflict (worker_id)
        do update set
          user_id = excluded.user_id,
          last_registered_at = now(),
          last_seen_at = now(),
          last_connection_id = excluded.last_connection_id,
          paths = excluded.paths,
          skills = excluded.skills,
          enabled_task_types = excluded.enabled_task_types,
          max_concurrent_tasks = excluded.max_concurrent_tasks,
          state = 'started',
          state_updated_at = now(),
          stopped_at = null
        where client_workers.state = 'stopped'
          or client_workers.last_connection_id = excluded.last_connection_id
        returning ${workerRecordColumns}
      `,
      [
        input.workerId,
        input.userId,
        input.connectionId,
        input.paths,
        input.skills,
        normalizeEnabledTaskTypes(input.enabledTaskTypes),
        normalizeMaxConcurrentTasks(input.maxConcurrentTasks)
      ]
    );

    if (!result.rows[0]) {
      throw new Error("worker id is already registered");
    }

    return mapWorkerRecord(result.rows[0]);
  }

  public async markWorkerStopped(workerId: string, connectionId: string): Promise<void> {
    await this.pool.query(
      `
        update client_workers
        set state = 'stopped',
          state_updated_at = now(),
          stopped_at = now()
        where worker_id = $1
          and last_connection_id = $2
      `,
      [workerId, connectionId]
    );
  }

  public async markAllWorkersStopped(): Promise<void> {
    await this.pool.query(
      `
        update client_workers
        set state = 'stopped',
          state_updated_at = now(),
          stopped_at = now()
        where state <> 'stopped'
      `
    );
  }

  public async setWorkerEnabledForUser(userId: string, workerId: string, enabled: boolean): Promise<WorkerRecord | undefined> {
    const result = await this.pool.query(
      `
        update client_workers
        set enabled = $3
        where client_workers.user_id = $1
          and client_workers.worker_id = $2
        returning ${workerRecordColumns}
      `,
      [userId, workerId, enabled]
    );

    return result.rows[0] ? mapWorkerRecord(result.rows[0]) : undefined;
  }

  public async disableWorkersForUser(userId: string): Promise<WorkerRecord[]> {
    const result = await this.pool.query(
      `
        update client_workers
        set enabled = false
        where client_workers.user_id = $1
          and client_workers.enabled = true
        returning ${workerRecordColumns}
      `,
      [userId]
    );

    return result.rows.map(mapWorkerRecord);
  }

  public async refreshWorkerActivity(workerId: string, state: Exclude<ClientState, "stopped">): Promise<void> {
    await this.pool.query(
      `
        update client_workers
        set state = $2,
          last_seen_at = now(),
          state_updated_at = now(),
          stopped_at = null
        where worker_id = $1
          and state <> 'stopped'
      `,
      [workerId, state]
    );
  }
}

const workerRecordColumnNames = [
  "worker_id",
  "user_id",
  "first_registered_at",
  "last_registered_at",
  "last_seen_at",
  "last_connection_id",
  "paths",
  "skills",
  "enabled",
  "enabled_task_types",
  "max_concurrent_tasks",
  "state",
  "state_updated_at",
  "stopped_at"
];

const workerRecordColumns = workerRecordColumnNames.join(", ");
const prefixedWorkerRecordColumns = workerRecordColumnNames
  .map((column) => `client_workers.${column}`)
  .join(", ");

export function mapWorkerRecord(row: QueryResultRow): WorkerRecord {
  const stateUpdatedAt = row.state_updated_at ?? row.last_seen_at ?? row.last_registered_at ?? row.first_registered_at;
  const state = mapWorkerState(row.state);

  return {
    workerId: String(row.worker_id),
    userId: String(row.user_id),
    firstRegisteredAt: toIsoString(row.first_registered_at),
    lastRegisteredAt: toIsoString(row.last_registered_at),
    lastSeenAt: row.last_seen_at ? toIsoString(row.last_seen_at) : undefined,
    lastConnectionId: row.last_connection_id ? String(row.last_connection_id) : undefined,
    paths: Array.isArray(row.paths) ? row.paths.map(String) : [],
    skills: Array.isArray(row.skills) ? row.skills.map(String) : [],
    enabled: row.enabled !== false,
    enabledTaskTypes: normalizeEnabledTaskTypes(row.enabled_task_types),
    maxConcurrentTasks: normalizeMaxConcurrentTasks(Number(row.max_concurrent_tasks)),
    state,
    stateUpdatedAt: toIsoString(stateUpdatedAt),
    stoppedAt: row.stopped_at ? toIsoString(row.stopped_at) : undefined
  };
}

function mapWorkerState(value: unknown): ClientState {
  if (value === "started" || value === "running_command" || value === "stopped") return value;
  return "stopped";
}

function normalizeMaxConcurrentTasks(value: unknown): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 1;
  return Math.max(1, Math.min(8, numeric));
}
