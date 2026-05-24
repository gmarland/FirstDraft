import assert from "node:assert/strict";
import { CommandStore } from "../src/store/commands/commandStore.js";
import type { DbClient, DbQueryResult } from "../src/db/dbClient.js";

type QueryCall = {
  sql: string;
  parameters?: readonly unknown[];
};

class WorkerCommandsDbClient implements DbClient {
  public calls: QueryCall[] = [];

  public async query(sql: string, parameters?: readonly unknown[]): Promise<DbQueryResult> {
    this.calls.push({ sql, parameters });

    if (sql.includes("count(*)")) {
      assert.deepEqual(parameters, ["worker-1"]);
      return { rows: [{ total: "3" }], rowCount: 1 };
    }

    assert.match(sql, /order by created_at desc/);
    assert.match(sql, /limit \$2 offset \$3/);
    assert.deepEqual(parameters, ["worker-1", 2, 2]);
    return {
      rows: [
        commandRow("command-2", "2026-05-24T10:00:00.000Z"),
        commandRow("command-1", "2026-05-24T09:00:00.000Z")
      ],
      rowCount: 2
    };
  }
}

async function testListWorkerCommandsPaginatesAndCounts(): Promise<void> {
  const db = new WorkerCommandsDbClient();
  const store = new CommandStore(db);

  const result = await store.listWorkerCommands("worker-1", { page: 1, pageSize: 2 });

  assert.equal(result.total, 3);
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 2);
  assert.deepEqual(result.commands.map((command) => command.transactionId), ["command-2", "command-1"]);
  assert.equal(db.calls.length, 2);
}

class TaskQueueDbClient implements DbClient {
  public calls: QueryCall[] = [];

  public async query(sql: string, parameters?: readonly unknown[]): Promise<DbQueryResult> {
    this.calls.push({ sql, parameters });

    if (sql.includes("count(*)")) {
      assert.match(sql, /where user_id = \$1/);
      assert.match(sql, /status in \('queued', 'in_progress'\)/);
      assert.deepEqual(parameters, ["user-1"]);
      return { rows: [{ total: "4" }], rowCount: 1 };
    }

    assert.match(sql, /where user_id = \$1/);
    assert.match(sql, /status in \('queued', 'in_progress'\)/);
    assert.match(sql, /case when status = 'queued' then 0 else 1 end/);
    assert.match(sql, /created_at asc/);
    assert.match(sql, /limit \$2 offset \$3/);
    assert.deepEqual(parameters, ["user-1", 2, 2]);
    return {
      rows: [
        commandRow("queued-unassigned", "2026-05-24T09:00:00.000Z", {
          status: "queued",
          workerId: null
        }),
        commandRow("in-progress-assigned", "2026-05-24T10:00:00.000Z", {
          status: "in_progress",
          workerId: "worker-2"
        })
      ],
      rowCount: 2
    };
  }
}

async function testListTaskQueueForUserPaginatesCountsAndPreservesUnassignedWorker(): Promise<void> {
  const db = new TaskQueueDbClient();
  const store = new CommandStore(db);

  const result = await store.listTaskQueueForUser("user-1", { page: 1, pageSize: 2 });

  assert.equal(result.total, 4);
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 2);
  assert.deepEqual(result.commands.map((command) => command.transactionId), ["queued-unassigned", "in-progress-assigned"]);
  assert.deepEqual(result.commands.map((command) => command.status), ["queued", "in_progress"]);
  assert.equal(result.commands[0].workerId, undefined);
  assert.equal(result.commands[1].workerId, "worker-2");
  assert.equal(db.calls.length, 2);
}

function commandRow(
  transactionId: string,
  createdAt: string,
  overrides: { status?: string; workerId?: string | null; userId?: string } = {}
): Record<string, unknown> {
  return {
    transaction_id: transactionId,
    user_id: overrides.userId ?? "user-1",
    worker_id: overrides.workerId === undefined ? "worker-1" : overrides.workerId,
    command: "echo hello",
    execution_command: null,
    command_mode: "shell",
    repository_url: null,
    normalized_repository_url: null,
    status: overrides.status ?? "completed",
    result: null,
    agent_response: null,
    error_message: null,
    output_object_key: null,
    output_bytes: null,
    output_started_at: null,
    output_updated_at: null,
    created_at: createdAt,
    claimed_at: null,
    completed_at: null
  };
}

await testListWorkerCommandsPaginatesAndCounts();
await testListTaskQueueForUserPaginatesCountsAndPreservesUnassignedWorker();

console.log("command store tests passed");
