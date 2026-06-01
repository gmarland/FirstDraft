import assert from "node:assert/strict";
import { JiraIntegrationStore } from "../src/store/integrations/jiraIntegrationStore.js";
import type { DbClient, DbQueryResult } from "../src/db/dbClient.js";

class WorkerSettingsDbClient implements DbClient {
  public calls: Array<{ sql: string; parameters?: readonly unknown[] }> = [];

  public async query(sql: string, parameters?: readonly unknown[]): Promise<DbQueryResult> {
    this.calls.push({ sql, parameters });

    assert.match(sql, /from worker_jira_integrations/);
    assert.match(sql, /where user_id = \$1/);
    assert.match(sql, /worker_id = \$2/);
    assert.match(sql, /order by created_at asc/);
    assert.deepEqual(parameters, ["user-1", "worker-1"]);

    return {
      rows: [
        {
          worker_id: "worker-1",
          integration_id: "abc12",
          user_id: "user-1",
          site_url: "https://example.atlassian.net",
          email: "jira-user@example.com",
          board_id: 12,
          board_name: "FirstDraft",
          board_type: "scrum",
          board_filter_id: null,
          ready_status_id: "1",
          ready_status_name: "Ready",
          processing_status_id: "2",
          processing_status_name: "In Progress",
          processed_status_id: "3",
          processed_status_name: "Done",
          assignee_account_ids: ["account-1"],
          assignee_display_names: ["Jira User"],
          assignee_email_addresses: ["assignee@example.com"],
          enabled: true,
          updated_at: new Date("2026-06-01T00:02:00.000Z"),
        },
      ],
      rowCount: 1,
    };
  }
}

async function testListWorkerSettingsFiltersByUserAndWorker(): Promise<void> {
  const db = new WorkerSettingsDbClient();
  const store = new JiraIntegrationStore(db);

  const settings = await store.listWorkerSettings("user-1", "worker-1");

  assert.equal(settings.length, 1);
  assert.equal(settings[0].id, "abc12");
  assert.equal(settings[0].workerId, "worker-1");
  assert.equal(settings[0].email, "jira-user@example.com");
  assert.equal(settings[0].assignees[0].emailAddress, "assignee@example.com");
  assert.equal(db.calls.length, 1);
}

await testListWorkerSettingsFiltersByUserAndWorker();

console.log("jira integration store tests passed");
