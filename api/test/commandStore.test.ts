import assert from "node:assert/strict";
import { CommandStore } from "../src/store/commands/commandStore.js";
import type { DbClient, DbQueryResult } from "../src/db/dbClient.js";

type QueryCall = {
  sql: string;
  parameters?: readonly unknown[];
};

class FakeDbClient implements DbClient {
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
  const db = new FakeDbClient();
  const store = new CommandStore(db);

  const result = await store.listWorkerCommands("worker-1", { page: 1, pageSize: 2 });

  assert.equal(result.total, 3);
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 2);
  assert.deepEqual(result.commands.map((command) => command.transactionId), ["command-2", "command-1"]);
  assert.equal(db.calls.length, 2);
}

function commandRow(transactionId: string, createdAt: string): Record<string, unknown> {
  return {
    transaction_id: transactionId,
    user_id: "user-1",
    worker_id: "worker-1",
    command: "echo hello",
    execution_command: null,
    command_mode: "shell",
    repository_url: null,
    normalized_repository_url: null,
    status: "completed",
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

console.log("command store tests passed");
