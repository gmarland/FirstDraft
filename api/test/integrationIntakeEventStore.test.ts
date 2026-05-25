import assert from "node:assert/strict";
import { IntegrationIntakeEventStore } from "../src/store/integrations/integrationIntakeEventStore.js";
import type { DbClient, DbQueryResult } from "../src/db/dbClient.js";

type QueryCall = {
  sql: string;
  parameters?: readonly unknown[];
};

class MarkProcessingDbClient implements DbClient {
  public calls: QueryCall[] = [];

  public async query(sql: string, parameters?: readonly unknown[]): Promise<DbQueryResult> {
    this.calls.push({ sql, parameters });

    assert.match(sql, /update integration_intake_events/);
    assert.match(sql, /\$4::text is null/);
    assert.match(sql, /from client_commands commands/);
    assert.match(sql, /inner join client_workers assigned_worker/);
    assert.match(sql, /assigned_worker\.worker_id = \$4/);
    assert.match(sql, /assigned_worker\.worker_id = commands\.worker_id/);
    assert.match(sql, /inner join api_keys assigned_api_key/);
    assert.match(sql, /assigned_api_key\.id = assigned_worker\.api_key_id/);
    assert.match(sql, /commands\.transaction_id = coalesce\(\$5, integration_intake_events\.transaction_id\)/);
    assert.match(sql, /commands\.user_id = integration_intake_events\.user_id/);
    assert.match(sql, /commands\.user_id = assigned_api_key\.user_id/);
    assert.match(sql, /assigned_api_key\.revoked_at is null/);
    assert.deepEqual(parameters, ["event-1", "processing", null, "worker-1", null]);

    return {
      rows: [intakeEventRow({ status: "processing", workerId: "worker-1" })],
      rowCount: 1
    };
  }
}

async function testMarkProcessingValidatesWorkerOwnsLinkedCommand(): Promise<void> {
  const db = new MarkProcessingDbClient();
  const store = new IntegrationIntakeEventStore(db);

  const result = await store.markProcessing("event-1", "worker-1");

  assert.equal(result.status, "processing");
  assert.equal(result.workerId, "worker-1");
  assert.equal(db.calls.length, 1);
}

class RejectedWorkerAssignmentDbClient implements DbClient {
  public calls: QueryCall[] = [];

  public async query(sql: string, parameters?: readonly unknown[]): Promise<DbQueryResult> {
    this.calls.push({ sql, parameters });
    assert.match(sql, /commands\.user_id = assigned_api_key\.user_id/);
    assert.deepEqual(parameters, ["event-1", "processing", null, "worker-2", null]);
    return { rows: [], rowCount: 0 };
  }
}

async function testMarkProcessingRejectsWorkerWithoutOwnedCommand(): Promise<void> {
  const db = new RejectedWorkerAssignmentDbClient();
  const store = new IntegrationIntakeEventStore(db);

  await assert.rejects(
    () => store.markProcessing("event-1", "worker-2"),
    /Integration intake event not found/
  );
  assert.equal(db.calls.length, 1);
}

function intakeEventRow(
  overrides: {
    status?: string;
    workerId?: string | null;
    transactionId?: string | null;
  } = {}
): Record<string, unknown> {
  return {
    id: "event-1",
    user_id: "user-1",
    provider: "jira",
    integration_id: "integration-1",
    source_item_id: "10001",
    source_item_key: "FD-123",
    source_item_url: "https://example.atlassian.net/browse/FD-123",
    repository_url: "https://github.com/example/repo.git",
    normalized_repository_url: "github.com/example/repo",
    worker_id: overrides.workerId === undefined ? null : overrides.workerId,
    transaction_id: overrides.transactionId === undefined ? "command-1" : overrides.transactionId,
    status: overrides.status ?? "queued",
    error_message: null,
    metadata: {},
    created_at: "2026-05-24T09:00:00.000Z",
    updated_at: "2026-05-24T09:01:00.000Z"
  };
}

await testMarkProcessingValidatesWorkerOwnsLinkedCommand();
await testMarkProcessingRejectsWorkerWithoutOwnedCommand();

console.log("integration intake event store tests passed");
