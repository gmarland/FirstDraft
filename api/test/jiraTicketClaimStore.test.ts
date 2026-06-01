import assert from "node:assert/strict";
import { JiraTicketClaimStore } from "../src/store/integrations/jiraTicketClaimStore.js";
import type { DbClient, DbQueryResult } from "../src/db/dbClient.js";

class SuccessfulClaimDbClient implements DbClient {
  public calls: Array<{ sql: string; parameters?: readonly unknown[] }> = [];

  public async query(sql: string, parameters?: readonly unknown[]): Promise<DbQueryResult> {
    this.calls.push({ sql, parameters });
    if (this.calls.length === 1) {
      assertStaleClaimExpiryQuery(sql, parameters);
      return { rows: [], rowCount: 0 };
    }

    assert.match(sql, /with worker_integration as/);
    assert.match(sql, /'gitflow' = any\(workers\.enabled_task_types\)/);
    assert.match(sql, /'git' = any\(workers\.skills\)/);
    assert.match(sql, /workers\.max_concurrent_tasks is null/);
    assert.match(sql, /active_commands\.status = 'in_progress'/);
    assert.match(sql, /active_commands\.claimed_at >= now\(\) - \(\$13::int \* interval '1 minute'\)/);
    assert.match(sql, /repositories\.normalized_repository_url = \$8/);
    assert.match(sql, /active_event as/);
    assert.match(sql, /claimable_existing_event as/);
    assert.match(sql, /updated_existing_event as/);
    assert.match(sql, /claim_event as/);
    assert.match(sql, /insert into integration_intake_events/);
    assert.match(sql, /worker_id,\s*transaction_id,\s*metadata,/);
    assert.match(sql, /worker_integration\.worker_id,\s*\$10,\s*\$9::jsonb/);
    assert.match(sql, /on conflict \(provider, source_item_url\)/);
    assert.match(sql, /insert into client_commands/);
    assert.match(sql, /'in_progress'/);
    assert.match(sql, /'processing',\s*now\(\)/);
    assert.match(sql, /transaction_id = \$10/);
    assert.doesNotMatch(sql, /'queueing',\s*now\(\)/);
    assert.match(sql, /claimed_at/);
    assert.match(sql, /insert into integration_intake_event_users/);
    assert.match(sql, /insert into client_command_users/);
    assert.equal(parameters?.[0], "worker-1");
    assert.equal(parameters?.[1], "user-1");
    assert.equal(parameters?.[2], "abc12");
    assert.equal(parameters?.[3], "issue-1");
    assert.equal(parameters?.[4], "FD-1");
    assert.equal(parameters?.[5], "https://example.atlassian.net/browse/FD-1");
    assert.equal(parameters?.[6], "https://github.com/example/repo.git");
    assert.equal(parameters?.[7], "github.com/example/repo");
    assert.equal(parameters?.[10], "{\"repositoryUrl\":\"https://github.com/example/repo.git\",\"ticketNumber\":\"FD-1\"}");
    assert.equal(parameters?.[11], "FD-1: https://github.com/example/repo.git");
    assert.equal(parameters?.[12], 30);

    return {
      rows: [
        {
          ...commandRow(),
          event_id: "event-1",
          event_provider: "jira",
          event_source_item_id: "issue-1",
          event_source_item_key: "FD-1",
          event_source_item_url: "https://example.atlassian.net/browse/FD-1",
          event_repository_url: "https://github.com/example/repo.git",
          event_normalized_repository_url: "github.com/example/repo",
          event_worker_id: "worker-1",
          event_transaction_id: "transaction-1",
          event_status: "processing",
          event_error_message: null,
          event_metadata: {},
          event_created_at: "2026-05-31T09:00:00.000Z",
          event_updated_at: "2026-05-31T09:00:01.000Z",
        },
      ],
      rowCount: 1,
    };
  }
}

async function testClaimCreatesInProgressCommandForWorker(): Promise<void> {
  const db = new SuccessfulClaimDbClient();
  const store = new JiraTicketClaimStore(db);

  const result = await store.claim({
    workerId: "worker-1",
    userId: "user-1",
    integrationId: "abc12",
    sourceItemId: "issue-1",
    sourceItemKey: "FD-1",
    sourceItemUrl: "https://example.atlassian.net/browse/FD-1",
    repositoryUrl: "https://github.com/example/repo.git",
    normalizedRepositoryUrl: "github.com/example/repo",
    command: "{\"repositoryUrl\":\"https://github.com/example/repo.git\",\"ticketNumber\":\"FD-1\"}",
    metadata: { issueKey: "FD-1" },
  });

  assert.equal(result.claimed, true);
  if (result.claimed) {
    assert.equal(result.command.workerId, "worker-1");
    assert.equal(result.command.status, "in_progress");
    assert.equal(result.event.status, "processing");
    assert.equal(result.event.workerId, "worker-1");
  }
  assert.equal(db.calls.length, 2);
}

class AdoptQueueingClaimDbClient implements DbClient {
  public calls: Array<{ sql: string; parameters?: readonly unknown[] }> = [];

  public async query(sql: string, parameters?: readonly unknown[]): Promise<DbQueryResult> {
    this.calls.push({ sql, parameters });
    if (this.calls.length === 1) {
      assertStaleClaimExpiryQuery(sql, parameters);
      return { rows: [], rowCount: 0 };
    }

    assert.match(sql, /active_event as/);
    assert.match(sql, /claimable_existing_event as/);
    assert.match(sql, /from active_event/);
    assert.match(sql, /updated_existing_event as/);
    assert.match(sql, /inner join claim_event on true/);
    assert.match(sql, /set status = 'processing'/);
    assert.match(sql, /transaction_id = \$10/);

    return {
      rows: [
        {
          ...commandRow(),
          event_id: "existing-event-1",
          event_provider: "jira",
          event_source_item_id: "issue-1",
          event_source_item_key: "FD-1",
          event_source_item_url: "https://example.atlassian.net/browse/FD-1",
          event_repository_url: "https://github.com/example/repo.git",
          event_normalized_repository_url: "github.com/example/repo",
          event_worker_id: "worker-1",
          event_transaction_id: "transaction-1",
          event_status: "processing",
          event_error_message: null,
          event_metadata: {},
          event_created_at: "2026-05-31T09:00:00.000Z",
          event_updated_at: "2026-05-31T09:00:01.000Z",
        },
      ],
      rowCount: 1,
    };
  }
}

async function testClaimAdoptsExistingQueueingEvent(): Promise<void> {
  const db = new AdoptQueueingClaimDbClient();
  const store = new JiraTicketClaimStore(db);

  const result = await store.claim({
    workerId: "worker-1",
    userId: "user-1",
    integrationId: "abc12",
    sourceItemId: "issue-1",
    sourceItemKey: "FD-1",
    sourceItemUrl: "https://example.atlassian.net/browse/FD-1",
    repositoryUrl: "https://github.com/example/repo.git",
    normalizedRepositoryUrl: "github.com/example/repo",
    command: "{\"repositoryUrl\":\"https://github.com/example/repo.git\",\"ticketNumber\":\"FD-1\"}",
    metadata: { issueKey: "FD-1" },
  });

  assert.equal(result.claimed, true);
  if (result.claimed) {
    assert.equal(result.event.id, "existing-event-1");
    assert.equal(result.event.status, "processing");
    assert.equal(result.command.status, "in_progress");
  }
  assert.equal(db.calls.length, 2);
}

class DuplicateClaimDbClient implements DbClient {
  public calls: Array<{ sql: string; parameters?: readonly unknown[] }> = [];

  public async query(sql: string, parameters?: readonly unknown[]): Promise<DbQueryResult> {
    this.calls.push({ sql, parameters });
    if (this.calls.length === 1) {
      assertStaleClaimExpiryQuery(sql, parameters);
      return { rows: [], rowCount: 0 };
    }

    if (this.calls.length === 2) {
      return { rows: [], rowCount: 0 };
    }

    assert.match(sql, /where provider = 'jira'/);
    assert.match(sql, /source_item_url = \$1/);
    assert.deepEqual(parameters, ["https://example.atlassian.net/browse/FD-1"]);
    return {
      rows: [
        {
          id: "event-1",
          provider: "jira",
          source_item_id: "issue-1",
          source_item_key: "FD-1",
          source_item_url: "https://example.atlassian.net/browse/FD-1",
          repository_url: "https://github.com/example/repo.git",
          normalized_repository_url: "github.com/example/repo",
          worker_id: "worker-1",
          transaction_id: "transaction-1",
          status: "processing",
          error_message: null,
          metadata: {},
          created_at: "2026-05-31T09:00:00.000Z",
          updated_at: "2026-05-31T09:00:01.000Z",
        },
      ],
      rowCount: 1,
    };
  }
}

async function testDuplicateClaimReturnsExistingActiveEvent(): Promise<void> {
  const db = new DuplicateClaimDbClient();
  const store = new JiraTicketClaimStore(db);

  const result = await store.claim({
    workerId: "worker-2",
    userId: "user-2",
    integrationId: "abc12",
    sourceItemId: "issue-1",
    sourceItemKey: "FD-1",
    sourceItemUrl: "https://example.atlassian.net/browse/FD-1",
    repositoryUrl: "https://github.com/example/repo.git",
    normalizedRepositoryUrl: "github.com/example/repo",
    command: "{}",
  });

  assert.equal(result.claimed, false);
  assert.equal(result.reason, "Jira issue already has an active intake event");
  assert.equal(result.event?.workerId, "worker-1");
  assert.equal(result.event?.transactionId, "transaction-1");
  assert.equal(db.calls.length, 3);
}

class CapacityRejectedClaimDbClient implements DbClient {
  public calls: Array<{ sql: string; parameters?: readonly unknown[] }> = [];

  public async query(sql: string, parameters?: readonly unknown[]): Promise<DbQueryResult> {
    this.calls.push({ sql, parameters });
    if (this.calls.length === 1) {
      assertStaleClaimExpiryQuery(sql, parameters);
      return { rows: [], rowCount: 0 };
    }

    if (this.calls.length === 2) {
      return { rows: [], rowCount: 0 };
    }

    if (this.calls.length === 3) {
      assert.match(sql, /from integration_intake_events/);
      return { rows: [], rowCount: 0 };
    }

    assert.match(sql, /active_command_count/);
    assert.match(sql, /worker_git_repositories/);
    assert.deepEqual(parameters, [
      "worker-1",
      "user-1",
      "abc12",
      "github.com/example/repo",
      30,
    ]);
    return {
      rows: [
        {
          worker_exists: true,
          integration_exists: true,
          integration_enabled: true,
          gitflow_enabled: true,
          git_skill_enabled: true,
          repository_configured: true,
          max_concurrent_tasks: 3,
          active_command_count: 3,
        },
      ],
      rowCount: 1,
    };
  }
}

async function testRejectedClaimReturnsCapacityReasonWithoutEvent(): Promise<void> {
  const db = new CapacityRejectedClaimDbClient();
  const store = new JiraTicketClaimStore(db);

  const result = await store.claim({
    workerId: "worker-1",
    userId: "user-1",
    integrationId: "abc12",
    sourceItemId: "issue-1",
    sourceItemKey: "FD-1",
    sourceItemUrl: "https://example.atlassian.net/browse/FD-1",
    repositoryUrl: "https://github.com/example/repo.git",
    normalizedRepositoryUrl: "github.com/example/repo",
    command: "{}",
  });

  assert.equal(result.claimed, false);
  assert.equal(result.event, undefined);
  assert.equal(result.reason, "worker has no available capacity (3/3 active gitflow tasks)");
  assert.equal(db.calls.length, 4);
}

function assertStaleClaimExpiryQuery(sql: string, parameters?: readonly unknown[]): void {
  assert.match(sql, /with stale_events as/);
  assert.match(sql, /update client_commands/);
  assert.match(sql, /update integration_intake_events/);
  assert.match(sql, /events\.source_item_url = \$1/);
  assert.match(sql, /events\.status in \('queueing', 'queued', 'processing'\)/);
  assert.match(sql, /events\.status = 'processing' and \(events\.worker_id is null or events\.transaction_id is null\)/);
  assert.match(sql, /commands\.status in \('queued', 'in_progress'\)/);
  assert.deepEqual(parameters, [
    "https://example.atlassian.net/browse/FD-1",
    30,
    "Jira ticket claim expired after 30 minutes without completion.",
  ]);
}

function commandRow(): Record<string, unknown> {
  return {
    transaction_id: "transaction-1",
    user_id: "user-1",
    worker_id: "worker-1",
    command: "{\"repositoryUrl\":\"https://github.com/example/repo.git\",\"ticketNumber\":\"FD-1\"}",
    task_summary: "FD-1: https://github.com/example/repo.git",
    execution_command: "{\"repositoryUrl\":\"https://github.com/example/repo.git\",\"ticketNumber\":\"FD-1\"}",
    command_mode: "gitflow",
    repository_url: "https://github.com/example/repo.git",
    normalized_repository_url: "github.com/example/repo",
    status: "in_progress",
    result: null,
    agent_response: null,
    error_message: null,
    output_object_key: null,
    output_bytes: null,
    output_started_at: null,
    output_updated_at: null,
    created_at: "2026-05-31T09:00:00.000Z",
    claimed_at: "2026-05-31T09:00:00.000Z",
    completed_at: null,
  };
}

await testClaimCreatesInProgressCommandForWorker();
await testClaimAdoptsExistingQueueingEvent();
await testDuplicateClaimReturnsExistingActiveEvent();
await testRejectedClaimReturnsCapacityReasonWithoutEvent();

console.log("jira ticket claim store tests passed");
