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
    assert.match(sql, /inner join client_command_users command_users/);
    assert.match(sql, /command_users\.transaction_id = commands\.transaction_id/);
    assert.match(sql, /command_users\.user_id = assigned_api_key\.user_id/);
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
    assert.match(sql, /command_users\.user_id = assigned_api_key\.user_id/);
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

class BeginExistingEventDbClient implements DbClient {
  public calls: QueryCall[] = [];

  public async query(sql: string, parameters?: readonly unknown[]): Promise<DbQueryResult> {
    this.calls.push({ sql, parameters });

    if (this.calls.length === 1) {
      assert.match(sql, /on conflict \(provider, source_item_url\)/);
      assert.match(sql, /source_item_url is not null/);
      assert.deepEqual(parameters, [
        "user-2",
        "jira",
        "integration-2",
        "10001",
        "FD-123",
        "https://example.atlassian.net/browse/FD-123",
        "https://github.com/example/repo.git",
        "github.com/example/repo",
        JSON.stringify({ issueKey: "FD-123" })
      ]);
      return { rows: [], rowCount: 0 };
    }

    if (this.calls.length === 2) {
      assert.match(sql, /where provider = \$1/);
      assert.match(sql, /source_item_url = \$2/);
      assert.match(sql, /status in \('queueing', 'queued', 'processing'\)/);
      assert.deepEqual(parameters, ["jira", "https://example.atlassian.net/browse/FD-123"]);
      return {
        rows: [intakeEventRow({ transactionId: "command-1" })],
        rowCount: 1
      };
    }

    if (this.calls.length === 3) {
      assert.match(sql, /insert into integration_intake_event_users/);
      assert.deepEqual(parameters, ["event-1", "user-2", "integration-2"]);
      return { rows: [], rowCount: 0 };
    }

    assert.match(sql, /insert into client_command_users/);
    assert.deepEqual(parameters, ["command-1", "user-2"]);
    return { rows: [], rowCount: 0 };
  }
}

async function testBeginJoinsExistingActiveEventBySourceUrl(): Promise<void> {
  const db = new BeginExistingEventDbClient();
  const store = new IntegrationIntakeEventStore(db);

  const result = await store.begin({
    userId: "user-2",
    provider: "jira",
    integrationId: "integration-2",
    sourceItemId: "10001",
    sourceItemKey: "FD-123",
    sourceItemUrl: "https://example.atlassian.net/browse/FD-123",
    repositoryUrl: "https://github.com/example/repo.git",
    normalizedRepositoryUrl: "github.com/example/repo",
    metadata: { issueKey: "FD-123" }
  });

  assert.equal(result.created, false);
  assert.equal(result.event.transactionId, "command-1");
  assert.equal(db.calls.length, 4);
}

class MarkQueuedDbClient implements DbClient {
  public calls: QueryCall[] = [];

  public async query(sql: string, parameters?: readonly unknown[]): Promise<DbQueryResult> {
    this.calls.push({ sql, parameters });

    if (this.calls.length === 1) {
      assert.match(sql, /update integration_intake_events/);
      assert.deepEqual(parameters, ["event-1", "queued", null, null, "command-1"]);
      return {
        rows: [intakeEventRow({ status: "queued", transactionId: "command-1" })],
        rowCount: 1
      };
    }

    assert.match(sql, /insert into client_command_users/);
    assert.match(sql, /from integration_intake_event_users/);
    assert.deepEqual(parameters, ["event-1", "command-1"]);
    return { rows: [], rowCount: 0 };
  }
}

async function testMarkQueuedCopiesEventParticipantsToCommand(): Promise<void> {
  const db = new MarkQueuedDbClient();
  const store = new IntegrationIntakeEventStore(db);

  const result = await store.markQueued("event-1", "command-1");

  assert.equal(result.status, "queued");
  assert.equal(result.transactionId, "command-1");
  assert.equal(db.calls.length, 2);
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
await testBeginJoinsExistingActiveEventBySourceUrl();
await testMarkQueuedCopiesEventParticipantsToCommand();

console.log("integration intake event store tests passed");
