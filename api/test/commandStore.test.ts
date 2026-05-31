import assert from "node:assert/strict";
import { CommandStore } from "../src/store/commands/commandStore.js";
import { buildTaskSummary } from "../src/store/commands/commandSummary.js";
import type { TaskQueueSortBy, TaskQueueSortDirection } from "../src/store/clientStore.js";
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

class CreateQueuedCommandDbClient implements DbClient {
  public calls: QueryCall[] = [];
  public insertedTaskSummary: unknown;

  public async query(sql: string, parameters?: readonly unknown[]): Promise<DbQueryResult> {
    this.calls.push({ sql, parameters });

    if (this.calls.length === 1) {
      assert.match(sql, /insert into client_commands/);
      assert.match(sql, /task_summary/);
      assert.match(sql, /returning transaction_id/);
      assert.equal(parameters?.[1], "user-1");
      assert.equal(parameters?.[3], "echo hello");
      this.insertedTaskSummary = parameters?.[4];
      return {
        rows: [
          commandRow(String(parameters?.[0]), "2026-05-24T09:00:00.000Z", {
            status: "queued",
            workerId: null
          })
        ],
        rowCount: 1
      };
    }

    assert.match(sql, /insert into client_command_users/);
    assert.deepEqual(parameters, [this.calls[0].parameters?.[0], "user-1"]);
    return { rows: [], rowCount: 0 };
  }
}

async function testCreateQueuedCommandAddsOwnerMembership(): Promise<void> {
  const db = new CreateQueuedCommandDbClient();
  const store = new CommandStore(db);

  const result = await store.createQueuedCommand({
    userId: "user-1",
    command: "echo hello",
    commandMode: "shell"
  });

  assert.equal(result.userId, "user-1");
  assert.equal(result.status, "queued");
  assert.equal(db.insertedTaskSummary, "echo hello");
  assert.equal(db.calls.length, 2);
}

function testBuildTaskSummary(): void {
  assert.equal(buildTaskSummary("echo hello", "shell"), "echo hello");
  assert.equal(
    buildTaskSummary(
      JSON.stringify({
        repositoryUrl: "https://github.com/example/repo.git",
        ticketNumber: "FD-123",
        title: "Build sortable queue",
        description: "Fallback description"
      }),
      "gitflow"
    ),
    "FD-123: Build sortable queue"
  );
  assert.equal(buildTaskSummary("{", "gitflow"), "{");
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

  public constructor(
    private readonly expectedOrderPattern = /case when commands\.status in \('completed', 'failed'\) then commands\.completed_at end desc nulls last/,
    private readonly rows: Array<Record<string, unknown>> = taskQueueRows()
  ) {}

  public async query(sql: string, parameters?: readonly unknown[]): Promise<DbQueryResult> {
    this.calls.push({ sql, parameters });

    if (sql.includes("select count(*) as total")) {
      assert.match(sql, /inner join client_command_users command_users/);
      assert.match(sql, /where command_users\.user_id = \$1/);
      assert.match(sql, /client_commands\.status = any\(\$2::text\[\]\)/);
      assert.deepEqual(parameters, ["user-1", ["queued", "in_progress", "completed", "failed"]]);
      return { rows: [{ total: "4" }], rowCount: 1 };
    }

    assert.match(sql, /inner join client_command_users command_users/);
    assert.match(sql, /left join client_workers assigned_worker/);
    assert.match(sql, /assigned_worker\.worker_id = commands\.worker_id/);
    assert.match(sql, /left join users worker_owner/);
    assert.match(sql, /worker_owner\.id = assigned_worker\.user_id/);
    assert.match(sql, /left join lateral/);
    assert.match(sql, /from integration_intake_events intake_events/);
    assert.match(sql, /worker_owner\.id as worker_owner_user_id/);
    assert.match(sql, /worker_owner\.name as worker_owner_name/);
    assert.match(sql, /worker_owner\.email as worker_owner_email/);
    assert.match(sql, /intake\.provider as source_provider/);
    assert.match(sql, /count\(\*\) over\(\) as task_queue_total/);
    assert.match(sql, /where command_users\.user_id = \$1/);
    assert.match(sql, /commands\.status = any\(\$4::text\[\]\)/);
    assert.match(sql, this.expectedOrderPattern);
    assert.match(sql, /limit \$2 offset \$3/);
    assert.deepEqual(parameters?.slice(0, 2), ["user-1", 2]);
    assert.deepEqual(parameters?.[3], ["queued", "in_progress", "completed", "failed"]);
    return {
      rows: this.rows,
      rowCount: this.rows.length
    };
  }
}

async function testListTaskQueueForUserPaginatesCountsAndPreservesUnassignedWorker(): Promise<void> {
  const db = new TaskQueueDbClient();
  const store = new CommandStore(db);

  const result = await store.listTaskQueueForUser("user-1", {
    page: 1,
    pageSize: 2,
    statuses: ["queued", "in_progress", "completed", "failed"]
  });

  assert.equal(result.total, 4);
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 2);
  assert.deepEqual(result.commands.map((command) => command.transactionId), [
    "queued-unassigned",
    "in-progress-assigned",
    "completed-assigned",
    "failed-assigned"
  ]);
  assert.deepEqual(result.commands.map((command) => command.status), ["queued", "in_progress", "completed", "failed"]);
  assert.equal(result.commands[0].workerId, undefined);
  assert.equal(result.commands[1].workerId, "worker-2");
  assert.equal(result.commands[0].workerOwnerUserId, undefined);
  assert.equal(result.commands[0].workerOwnerName, undefined);
  assert.equal(result.commands[0].workerOwnerEmail, undefined);
  assert.equal(result.commands[1].workerOwnerUserId, "user-2");
  assert.equal(result.commands[1].workerOwnerName, "Worker Owner");
  assert.equal(result.commands[1].workerOwnerEmail, "owner@example.com");
  assert.equal(result.commands[0].sourceProvider, "jira");
  assert.equal(result.commands[0].sourceItemId, "10001");
  assert.equal(result.commands[0].sourceItemKey, "FD-123");
  assert.equal(result.commands[0].sourceItemUrl, "https://example.atlassian.net/browse/FD-123");
  assert.equal(db.calls.length, 1);
}

async function testListTaskQueueForUserSortsByAllowlistedColumns(): Promise<void> {
  const cases: Array<{
    sortBy: TaskQueueSortBy;
    sortDirection: TaskQueueSortDirection;
    expectedOrderPattern: RegExp;
  }> = [
    { sortBy: "status", sortDirection: "desc", expectedOrderPattern: /case commands\.status[\s\S]*end desc, commands\.created_at asc/ },
    { sortBy: "source", sortDirection: "asc", expectedOrderPattern: /lower\(trim\(concat\([\s\S]*intake\.provider[\s\S]*commands\.command_mode = 'gitflow'[\s\S]*intake\.source_item_key[\s\S]*\)\)\) asc nulls first/ },
    { sortBy: "task", sortDirection: "asc", expectedOrderPattern: /lower\(coalesce\(commands\.task_summary, commands\.command, ''\)\) asc/ },
    { sortBy: "worker", sortDirection: "asc", expectedOrderPattern: /lower\(coalesce\([\s\S]*worker_owner\.id <> command_users\.user_id[\s\S]*coalesce\(worker_owner\.name, worker_owner\.email, commands\.worker_id\)[\s\S]*'Unassigned'[\s\S]*\)\) asc/ },
    { sortBy: "repository", sortDirection: "asc", expectedOrderPattern: /lower\(coalesce\(commands\.repository_url, ''\)\) asc nulls first/ },
    { sortBy: "created", sortDirection: "desc", expectedOrderPattern: /commands\.created_at desc, commands\.transaction_id asc/ }
  ];

  for (const sortCase of cases) {
    const db = new TaskQueueDbClient(sortCase.expectedOrderPattern);
    const store = new CommandStore(db);

    await store.listTaskQueueForUser("user-1", {
      page: 1,
      pageSize: 2,
      statuses: ["queued", "in_progress", "completed", "failed"],
      sortBy: sortCase.sortBy,
      sortDirection: sortCase.sortDirection
    });

    assert.equal(db.calls.length, 1);
  }
}

async function testListTaskQueueForUserCountsEmptyPage(): Promise<void> {
  const db = new TaskQueueDbClient(undefined, []);
  const store = new CommandStore(db);

  const result = await store.listTaskQueueForUser("user-1", {
    page: 99,
    pageSize: 2,
    statuses: ["queued", "in_progress", "completed", "failed"]
  });

  assert.equal(result.total, 4);
  assert.deepEqual(result.commands, []);
  assert.equal(db.calls.length, 2);
}

class DispatchableQueueDbClient implements DbClient {
  public calls: QueryCall[] = [];

  public async query(sql: string, parameters?: readonly unknown[]): Promise<DbQueryResult> {
    this.calls.push({ sql, parameters });

    assert.match(sql, /inner join client_workers claiming_worker/);
    assert.match(sql, /claiming_worker\.worker_id = \$1/);
    assert.match(sql, /inner join client_command_users command_users/);
    assert.match(sql, /command_users\.user_id = claiming_worker\.user_id/);
    assert.match(sql, /left join worker_git_repositories worker_repos/);
    assert.match(sql, /commands\.worker_id = \$1 or commands\.worker_id is null/);
    assert.match(sql, /worker_repos\.normalized_repository_url is not null/);
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
    assert.match(sql, /inner join client_command_users command_users/);
    assert.match(sql, /command_users\.transaction_id = client_commands\.transaction_id/);
    assert.match(sql, /command_users\.user_id = claiming_worker\.user_id/);
    assert.match(sql, /where client_commands\.transaction_id = \$1/);
    assert.match(sql, /claiming_worker\.worker_id = \$2/);
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
    taskSummary?: string;
    workerOwnerUserId?: string;
    workerOwnerName?: string;
    workerOwnerEmail?: string;
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
    worker_owner_user_id: overrides.workerOwnerUserId ?? null,
    worker_owner_name: overrides.workerOwnerName ?? null,
    worker_owner_email: overrides.workerOwnerEmail ?? null,
    command: "echo hello",
    task_summary: overrides.taskSummary ?? "echo hello",
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

function taskQueueRows(): Array<Record<string, unknown>> {
  return [
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
      workerId: "worker-2",
      workerOwnerUserId: "user-2",
      workerOwnerName: "Worker Owner",
      workerOwnerEmail: "owner@example.com"
    }),
    commandRow("completed-assigned", "2026-05-24T11:00:00.000Z", {
      status: "completed",
      workerId: "worker-3"
    }),
    commandRow("failed-assigned", "2026-05-24T12:00:00.000Z", {
      status: "failed",
      workerId: "worker-4"
    })
  ].map((row) => ({ ...row, task_queue_total: "4" }));
}

await testCreateQueuedCommandAddsOwnerMembership();
testBuildTaskSummary();
await testListWorkerCommandsPaginatesAndCounts();
await testListTaskQueueForUserPaginatesCountsAndPreservesUnassignedWorker();
await testListTaskQueueForUserSortsByAllowlistedColumns();
await testListTaskQueueForUserCountsEmptyPage();
await testGetDispatchableQueuedCommandsScopesUnassignedCommandsToApiKeyOwner();
await testMarkWorkerCommandInProgressScopesClaimToApiKeyOwner();

console.log("command store tests passed");
