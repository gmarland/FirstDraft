import assert from "node:assert/strict";
import { IntegrationLifecycleService } from "../src/integrations/integrationLifecycleService.js";
import type { Command } from "../src/types.js";

const originalFetch = globalThis.fetch;

function createJiraEvent(status: string) {
  return {
    id: "event-1",
    provider: "jira",
    sourceItemId: "issue-1",
    sourceItemKey: "SCRUM-7",
    sourceItemUrl: "https://example.atlassian.net/browse/SCRUM-7",
    repositoryUrl: "https://github.com/example/repo.git",
    normalizedRepositoryUrl: "github.com/example/repo",
    workerId: "worker-b",
    transactionId: "transaction-1",
    status,
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function testStartOnlyUpdatesInternalProcessingState(): Promise<void> {
  const fetchCalls: unknown[] = [];
  globalThis.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    fetchCalls.push(args);
    return jsonResponse({}, 200);
  };

  const markProcessingCalls: Array<{ id: string; workerId?: string }> = [];
  const lifecycle = new IntegrationLifecycleService(
    {
      async getByTransactionId(transactionId: string) {
        assert.equal(transactionId, "transaction-1");
        return createJiraEvent("processing");
      },
      async markProcessing(id: string, workerId?: string) {
        markProcessingCalls.push({ id, workerId });
        return createJiraEvent("processing");
      },
    } as never,
  );

  await lifecycle.commandStarted(createCommand("in_progress"));

  assert.deepEqual(markProcessingCalls, [{ id: "event-1", workerId: "worker-b" }]);
  assert.deepEqual(fetchCalls, []);
}

async function testCompletionOnlyMarksInternalEventProcessed(): Promise<void> {
  const fetchCalls: unknown[] = [];
  globalThis.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    fetchCalls.push(args);
    return jsonResponse({}, 200);
  };

  const markProcessedCalls: string[] = [];
  const lifecycle = new IntegrationLifecycleService(
    {
      async getByTransactionId(transactionId: string) {
        assert.equal(transactionId, "transaction-1");
        return createJiraEvent("processing");
      },
      async markProcessed(id: string) {
        markProcessedCalls.push(id);
        return createJiraEvent("processed");
      },
    } as never,
  );

  await lifecycle.commandCompleted(createCommand("completed"));

  assert.deepEqual(markProcessedCalls, ["event-1"]);
  assert.deepEqual(fetchCalls, []);
}

async function testFailureOnlyMarksInternalEventFailed(): Promise<void> {
  const fetchCalls: unknown[] = [];
  globalThis.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    fetchCalls.push(args);
    return jsonResponse({}, 200);
  };

  const markFailedCalls: Array<{ id: string; reason: string }> = [];
  const lifecycle = new IntegrationLifecycleService(
    {
      async getByTransactionId(transactionId: string) {
        assert.equal(transactionId, "transaction-1");
        return createJiraEvent("processing");
      },
      async markFailed(id: string, reason: string) {
        markFailedCalls.push({ id, reason });
        return createJiraEvent("failed");
      },
    } as never,
  );

  await lifecycle.commandCompleted({
    ...createCommand("failed"),
    errorMessage: "command failed",
  });

  assert.deepEqual(markFailedCalls, [{ id: "event-1", reason: "command failed" }]);
  assert.deepEqual(fetchCalls, []);
}

function createCommand(status: Command["status"]): Command {
  return {
    transactionId: "transaction-1",
    userId: "user-a",
    workerId: "worker-b",
    command: "{}",
    commandMode: "gitflow",
    status,
    result: "Pull request: https://github.com/example/repo/pull/1",
    createdAt: new Date().toISOString(),
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    async text() {
      return JSON.stringify(payload);
    },
    async json() {
      return payload;
    },
  } as Response;
}

try {
  await testStartOnlyUpdatesInternalProcessingState();
  await testCompletionOnlyMarksInternalEventProcessed();
  await testFailureOnlyMarksInternalEventFailed();
} finally {
  globalThis.fetch = originalFetch;
}

console.log("integration lifecycle tests passed");
