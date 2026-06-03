import assert from "node:assert/strict";
import { DbClient, DbQueryResult } from "../src/db/dbClient.js";
import { WorkerRecordStore } from "../src/store/workers/workerRecordStore.js";

async function testListWorkersFiltersArchivedWorkers(): Promise<void> {
  const db = new RecordingDbClient();
  const store = new WorkerRecordStore(db);

  await store.listWorkersForUser("user-1");

  assert.match(db.lastSql, /client_workers\.archived_at is null/);
  assert.deepEqual(db.lastParameters, ["user-1"]);
}

async function testGetWorkerCanReturnArchivedWorker(): Promise<void> {
  const db = new RecordingDbClient([workerRow({ archived_at: new Date("2026-01-04T00:00:00.000Z") })]);
  const store = new WorkerRecordStore(db);

  const worker = await store.getWorkerForUser("user-1", "worker-1");

  assert.equal(worker?.workerId, "worker-1");
  assert.equal(worker?.archivedAt, "2026-01-04T00:00:00.000Z");
}

async function testRegistrationClearsArchivedAt(): Promise<void> {
  const db = new RecordingDbClient([workerRow()]);
  const store = new WorkerRecordStore(db);

  await store.upsertWorkerRegistration({
    workerId: "worker-1",
    userId: "user-1",
    connectionId: "connection-1",
    paths: [],
    skills: [],
  });

  assert.match(db.lastSql, /archived_at = null/);
}

async function testHeartbeatClearsArchivedAt(): Promise<void> {
  const db = new RecordingDbClient([workerRow()]);
  const store = new WorkerRecordStore(db);

  await store.refreshWorkerHeartbeat("worker-1", "user-1");

  assert.match(db.lastSql, /archived_at = null/);
  assert.deepEqual(db.lastParameters, ["worker-1", "user-1"]);
}

async function testArchiveIdleWorkerForUserScopesByOwnerAndStartedState(): Promise<void> {
  const db = new RecordingDbClient([], 1);
  const store = new WorkerRecordStore(db);

  const archived = await store.archiveIdleWorkerForUser("user-1", "worker-1");

  assert.equal(archived, true);
  assert.match(db.lastSql, /set archived_at = now\(\)/);
  assert.match(db.lastSql, /user_id = \$1/);
  assert.match(db.lastSql, /worker_id = \$2/);
  assert.match(db.lastSql, /state = 'started'/);
  assert.match(db.lastSql, /archived_at is null/);
  assert.deepEqual(db.lastParameters, ["user-1", "worker-1"]);
}

class RecordingDbClient implements DbClient {
  public lastSql = "";
  public lastParameters: readonly unknown[] | undefined;

  public constructor(
    private readonly rows: Record<string, unknown>[] = [],
    private readonly rowCount: number | null = null,
  ) {}

  public async query<T = Record<string, unknown>>(
    sql: string,
    parameters?: readonly unknown[],
  ): Promise<DbQueryResult<T>> {
    this.lastSql = sql;
    this.lastParameters = parameters;
    return {
      rows: this.rows as T[],
      rowCount: this.rowCount,
    };
  }
}

function workerRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    worker_id: "worker-1",
    user_id: "user-1",
    first_registered_at: new Date("2026-01-01T00:00:00.000Z"),
    last_registered_at: new Date("2026-01-02T00:00:00.000Z"),
    last_seen_at: new Date("2026-01-03T00:00:00.000Z"),
    last_connection_id: "connection-1",
    paths: [],
    skills: [],
    enabled_task_types: ["gitflow"],
    max_concurrent_tasks: 1,
    state: "started",
    state_updated_at: new Date("2026-01-03T00:01:00.000Z"),
    stopped_at: null,
    archived_at: null,
    ...overrides,
  };
}

await testListWorkersFiltersArchivedWorkers();
await testGetWorkerCanReturnArchivedWorker();
await testRegistrationClearsArchivedAt();
await testHeartbeatClearsArchivedAt();
await testArchiveIdleWorkerForUserScopesByOwnerAndStartedState();

console.log("worker record store tests passed");
