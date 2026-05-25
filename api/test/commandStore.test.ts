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

    assert.match(sql, /left join integration_intake_events intake/);
    assert.match(sql, /intake\.provider as source_provider/);
    assert.match(sql, /where commands\.user_id = \$1/);
    assert.match(sql, /commands\.status in \('queued', 'in_progress'\)/);
    assert.match(sql, /case when commands\.status = 'queued' then 0 else 1 end/);
    assert.match(sql, /commands\.created_at asc/);
    assert.match(sql, /limit \$2 offset \$3/);
    assert.deepEqual(parameters, ["user-1", 2, 2]);
    return {
      rows: [
        commandRow("queued-unassigned", "2026-05-24T09:00:00.000Z", {
          status: "queued",
          workerId: null,
          sourceProvider: "jira",
          sourceItemId: "10001",
          sourceItemKey: "FD-123",
          sourceItemUrl: "https://example.atlassian.net/browse/FD-123"
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
  assert.equal(result.commands[0].sourceProvider, "jira");
  assert.equal(result.commands[0].sourceItemId, "10001");
  assert.equal(result.commands[0].sourceItemKey, "FD-123");
  assert.equal(result.commands[0].sourceItemUrl, "https://example.atlassian.net/browse/FD-123");
  assert.equal(db.calls.length, 2);
}

class DispatchableQueueDbClient implements DbClient {
  public calls: QueryCall[] = [];

  public async query(sql: string, parameters?: readonly unknown[]): Promise<DbQueryResult> {
    this.calls.push({ sql, parameters });

    assert.match(sql, /inner join client_workers claiming_worker/);
    assert.match(sql, /claiming_worker\.worker_id = \$1/);
    assert.match(sql, /inner join api_keys claiming_api_key/);
    assert.match(sql, /claiming_api_key\.id = claiming_worker\.api_key_id/);
    assert.match(sql, /commands\.user_id = claiming_api_key\.user_id/);
    assert.match(sql, /claiming_api_key\.revoked_at is null/);
    assert.match(sql, /commands\.worker_id = \$1 or commands\.worker_id is null/);
    assert.deepEqual(parameters, ["worker-1", true]);

    return {
      rows: [
        commandRow("owned-unassigned", "2026-05-24T09:00:00.000Z", {
          status: "queued",
          workerId: null
        })
      ],
      rowCount: 1
    };
  }
}

async function testGetDispatchableQueuedCommandsScopesUnassignedCommandsToApiKeyOwner(): Promise<void> {
  const db = new DispatchableQueueDbClient();
  const store = new CommandStore(db);

  const result = await store.getDispatchableQueuedCommands("worker-1", ["git"]);

  assert.deepEqual(result.map((command) => command.transactionId), ["owned-unassigned"]);
  assert.equal(result[0].workerId, undefined);
  assert.equal(db.calls.length, 1);
}

class ClaimCommandDbClient implements DbClient {
  public calls: QueryCall[] = [];

  public async query(sql: string, parameters?: readonly unknown[]): Promise<DbQueryResult> {
    this.calls.push({ sql, parameters });

    assert.match(sql, /update client_commands/);
    assert.match(sql, /from client_workers claiming_worker/);
    assert.match(sql, /inner join api_keys claiming_api_key/);
    assert.match(sql, /claiming_api_key\.id = claiming_worker\.api_key_id/);
    assert.match(sql, /where client_commands\.transaction_id = \$1/);
    assert.match(sql, /claiming_worker\.worker_id = \$2/);
    assert.match(sql, /client_commands\.user_id = claiming_api_key\.user_id/);
    assert.match(sql, /claiming_api_key\.revoked_at is null/);
    assert.match(sql, /client_commands\.status = 'queued'/);
    assert.match(sql, /client_commands\.worker_id is null or client_commands\.worker_id = \$2/);
    assert.match(sql, /returning client_commands\.transaction_id/);
    assert.match(sql, /client_commands\.user_id/);
    assert.deepEqual(parameters, ["owned-unassigned", "worker-1"]);

    return {
      rows: [
        commandRow("owned-unassigned", "2026-05-24T09:00:00.000Z", {
          status: "in_progress",
          workerId: "worker-1"
        })
      ],
      rowCount: 1
    };
  }
}

async function testMarkWorkerCommandInProgressScopesClaimToApiKeyOwner(): Promise<void> {
  const db = new ClaimCommandDbClient();
  const store = new CommandStore(db);

  const result = await store.markWorkerCommandInProgress({
    transactionId: "owned-unassigned",
    userId: "user-1",
    command: "echo hello",
    commandMode: "shell",
    status: "queued",
    createdAt: "2026-05-24T09:00:00.000Z"
  }, "worker-1");

  assert.equal(result?.transactionId, "owned-unassigned");
  assert.equal(result?.workerId, "worker-1");
  assert.equal(result?.status, "in_progress");
  assert.equal(db.calls.length, 1);
}

function commandRow(
  transactionId: string,
  createdAt: string,
  overrides: {
    status?: string;
    workerId?: string | null;
    userId?: string;
    sourceProvider?: string;
    sourceItemId?: string;
    sourceItemKey?: string;
    sourceItemUrl?: string;
  } = {}
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
    source_provider: overrides.sourceProvider ?? null,
    source_item_id: overrides.sourceItemId ?? null,
    source_item_key: overrides.sourceItemKey ?? null,
    source_item_url: overrides.sourceItemUrl ?? null,
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
await testGetDispatchableQueuedCommandsScopesUnassignedCommandsToApiKeyOwner();
await testMarkWorkerCommandInProgressScopesClaimToApiKeyOwner();

console.log("command store tests passed");
