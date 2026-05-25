import assert from "node:assert/strict";
import { IntegrationLifecycleService } from "../src/integrations/integrationLifecycleService.js";
import type { Command } from "../src/types.js";
import type { JiraIntegrationCredentials } from "../src/store/integrations/jiraIntegrationStore.js";

type FetchCall = {
  url: string;
  method: string;
  body?: unknown;
};

const originalFetch = globalThis.fetch;

async function testCompletionUsesClaimingWorkerIntegration(): Promise<void> {
  const fetchCalls = installFetchMock();
  const intakeEvents = {
    credentialsLookups: [] as unknown[],
    markProcessedCalls: [] as string[],
    async getByTransactionId(transactionId: string) {
      assert.equal(transactionId, "transaction-1");
      return {
        id: "event-1",
        provider: "jira",
        sourceItemId: "issue-1",
        sourceItemKey: "SCRUM-7",
        sourceItemUrl: "https://example.atlassian.net/browse/SCRUM-7",
        repositoryUrl: "https://github.com/example/repo.git",
        normalizedRepositoryUrl: "github.com/example/repo",
        workerId: "worker-b",
        transactionId,
        status: "processing",
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    },
    async getParticipantForWorker(transactionId: string, workerId: string) {
      assert.equal(transactionId, "transaction-1");
      assert.equal(workerId, "worker-b");
      return {
        eventId: "event-1",
        userId: "user-b",
        integrationId: "integration-b",
      };
    },
    async markProcessed(id: string) {
      this.markProcessedCalls.push(id);
      return {};
    },
    async markProcessing() {
      throw new Error("markProcessing should not be called on completion");
    },
    async markFailed() {
      throw new Error("markFailed should not be called on completion");
    },
  };
  const jiraIntegrations = {
    calls: [] as Array<{ userId: string; integrationId: string }>,
    async getCredentials(userId: string, integrationId: string): Promise<JiraIntegrationCredentials> {
      this.calls.push({ userId, integrationId });
      return {
        id: integrationId,
        userId,
        connected: true,
        enabled: true,
        siteUrl: "https://example.atlassian.net",
        email: "user-b@example.com",
        apiToken: "token-b",
        boardId: 1,
        boardName: "Board",
        boardType: "scrum",
        boardFilterId: 10,
        readyStatusId: "ready",
        readyStatusName: "Ready",
        processingStatusId: "doing-b",
        processingStatusName: "Doing B",
        processedStatusId: "done-b",
        processedStatusName: "Done B",
      };
    },
  };
  const lifecycle = new IntegrationLifecycleService(
    intakeEvents as never,
    jiraIntegrations as never,
  );

  await lifecycle.commandCompleted({
    transactionId: "transaction-1",
    userId: "user-a",
    workerId: "worker-b",
    command: "{}",
    commandMode: "gitflow",
    status: "completed",
    result: "Pull request: https://github.com/example/repo/pull/1",
    createdAt: new Date().toISOString(),
  } satisfies Command);

  assert.deepEqual(jiraIntegrations.calls, [
    { userId: "user-b", integrationId: "integration-b" },
    { userId: "user-b", integrationId: "integration-b" },
  ]);
  assert.equal(fetchCalls.some((call) => call.url.endsWith("/rest/api/3/issue/SCRUM-7/comment")), true);
  assert.equal(fetchCalls.some((call) => call.url.endsWith("/rest/api/3/issue/SCRUM-7/transitions") && call.method === "POST"), true);
  assert.deepEqual(intakeEvents.markProcessedCalls, ["event-1"]);
}

function installFetchMock(): FetchCall[] {
  const calls: FetchCall[] = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });

    if (url.endsWith("/rest/api/3/issue/SCRUM-7/comment")) {
      return jsonResponse({}, 201);
    }

    if (url.endsWith("/rest/api/3/issue/SCRUM-7/transitions") && method === "GET") {
      return jsonResponse({
        transitions: [
          {
            id: "41",
            name: "Done B",
            to: {
              id: "done-b",
              name: "Done B",
            },
          },
        ],
      });
    }

    if (url.endsWith("/rest/api/3/issue/SCRUM-7/transitions") && method === "POST") {
      assert.deepEqual(body, { transition: { id: "41" } });
      return jsonResponse({}, 204);
    }

    return jsonResponse({ errorMessages: [`Unexpected Jira URL: ${url}`] }, 404);
  };

  return calls;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    async text() {
      return status === 204 ? "" : JSON.stringify(payload);
    },
    async json() {
      return payload;
    },
  } as Response;
}

try {
  await testCompletionUsesClaimingWorkerIntegration();
} finally {
  globalThis.fetch = originalFetch;
}

console.log("integration lifecycle tests passed");
