import assert from "node:assert/strict";
import { JiraIntakeService } from "../src/integrations/jira/jiraIntakeService.js";
import type { JiraIntegrationCredentials } from "../src/store/integrations/jiraIntegrationStore.js";
import type { Command, CommandMode, WorkerRegistration } from "../src/types.js";

type FetchCall = {
  url: string;
  method: string;
  body?: unknown;
};

type FetchOptions = {
  commentStatus?: number;
  transitionStatus?: number;
  transitions?: Array<{
    id: string;
    name: string;
    to: {
      id: string;
      name: string;
    };
  }>;
};

const originalFetch = globalThis.fetch;

async function testMissingRepositoryCommentsAndTransitions(): Promise<void> {
  const { calls, service, stores } = setupService();

  const result = await service.run({ userId: "user-1", integrationId: "integration-1" });

  assert.equal(result.processed, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.items[0].status, "skipped");
  assert.equal(result.items[0].reason, "repository field is missing");
  assert.equal(stores.intakeEvents.beginCalls.length, 0);
  assert.equal(stores.workers.commands.length, 0);

  const comment = calls.find((call) => call.url.endsWith("/rest/api/3/issue/SCRUM-7/comment"));
  assert.ok(comment);
  assert.equal(comment.method, "POST");
  assert.deepEqual(comment.body, {
    body: {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "FirstDraft could not process this ticket because the required repository field is missing. Add a repository URL to the repository field before sending this ticket back for processing.",
            },
          ],
        },
      ],
    },
  });

  assert.ok(calls.find((call) => call.method === "GET" && call.url.endsWith("/rest/api/3/issue/SCRUM-7/transitions")));
  assert.ok(calls.find((call) => call.method === "POST" && call.url.endsWith("/rest/api/3/issue/SCRUM-7/transitions")));
}

async function testMissingRepositoryDryRunDoesNotCallJiraWriteEndpoints(): Promise<void> {
  const { calls, service, stores } = setupService();

  const result = await service.run({ userId: "user-1", integrationId: "integration-1", dryRun: true });

  assert.equal(result.processed, 1);
  assert.equal(result.items[0].status, "dry_run");
  assert.match(result.items[0].reason ?? "", /would comment and move issue to processed status/);
  assert.equal(stores.intakeEvents.beginCalls.length, 0);
  assert.equal(stores.workers.commands.length, 0);
  assert.equal(calls.some((call) => call.url.includes("/comment")), false);
  assert.equal(calls.some((call) => call.url.includes("/transitions")), false);
}

async function testMissingRepositoryCommentFailureReturnsFailed(): Promise<void> {
  const { service, stores } = setupService({ commentStatus: 500 });

  const result = await service.run({ userId: "user-1", integrationId: "integration-1" });

  assert.equal(result.failed, 1);
  assert.equal(result.items[0].status, "failed");
  assert.match(result.items[0].reason ?? "", /Jira API returned 500: comment failed/);
  assert.equal(stores.intakeEvents.beginCalls.length, 0);
  assert.equal(stores.workers.commands.length, 0);
}

async function testMissingRepositoryTransitionFailureReturnsFailed(): Promise<void> {
  const { service, stores } = setupService({ transitions: [] });

  const result = await service.run({ userId: "user-1", integrationId: "integration-1" });

  assert.equal(result.failed, 1);
  assert.equal(result.items[0].status, "failed");
  assert.equal(result.items[0].reason, "No Jira transition is available for SCRUM-7 to status Done");
  assert.equal(stores.intakeEvents.beginCalls.length, 0);
  assert.equal(stores.workers.commands.length, 0);
}

async function testMissingRepositoryWithoutProcessedStatusReturnsFailed(): Promise<void> {
  const { calls, service } = setupService({
    integration: {
      processedStatusId: "",
      processedStatusName: "",
    },
  });

  const result = await service.run({ userId: "user-1", integrationId: "integration-1" });

  assert.equal(result.failed, 1);
  assert.equal(result.items[0].status, "failed");
  assert.equal(result.items[0].reason, "processed status is not configured");
  assert.equal(calls.some((call) => call.url.includes("/comment")), false);
  assert.equal(calls.some((call) => call.url.includes("/transitions")), false);
}

async function testDuplicateIssueAcrossIntegrationsQueuesOneCommand(): Promise<void> {
  const { service, stores } = setupDuplicateIssueService();

  const result = await service.run({ maxIssues: 1 });

  assert.equal(result.processed, 2);
  assert.equal(result.queued, 1);
  assert.equal(result.skipped, 1);
  assert.equal(stores.intakeEvents.beginCalls.length, 2);
  assert.equal(stores.workers.commands.length, 1);
  assert.equal(stores.intakeEvents.markQueuedCalls.length, 1);
  assert.equal(stores.dispatcher.dispatchCalls, 1);
  assert.equal(result.items[0].status, "queued");
  assert.equal(result.items[0].transactionId, "transaction-1");
  assert.equal(result.items[1].status, "skipped");
  assert.equal(result.items[1].transactionId, "transaction-1");
  assert.equal(result.items[1].reason, "already queued");
}

function setupService(options: FetchOptions & { integration?: Partial<JiraIntegrationCredentials> } = {}) {
  const calls = installFetchMock(options);
  const integration: JiraIntegrationCredentials = {
    id: "integration-1",
    userId: "user-1",
    connected: true,
    enabled: true,
    siteUrl: "https://example.atlassian.net",
    email: "user@example.com",
    apiToken: "api-token",
    boardId: 1,
    boardName: "Board",
    boardType: "scrum",
    boardFilterId: 10,
    readyStatusId: "ready-id",
    readyStatusName: "Ready",
    processingStatusId: "doing-id",
    processingStatusName: "Doing",
    processedStatusId: "done-id",
    processedStatusName: "Done",
    ...options.integration,
  };

  const jiraIntegrations = {
    listEnabledCredentials: async () => [integration],
    listAllEnabledCredentials: async () => [integration],
  };
  const intakeEvents = {
    beginCalls: [] as unknown[],
    async begin(input: unknown) {
      this.beginCalls.push(input);
      throw new Error("begin should not be called for missing repository issues");
    },
  };
  const workers = {
    commands: [] as unknown[],
    async createQueuedCommand(input: { userId: string; command: string; commandMode?: CommandMode }) {
      this.commands.push(input);
      return {
        transactionId: "transaction-1",
        userId: input.userId,
        command: input.command,
        commandMode: input.commandMode ?? "ai",
        status: "queued",
        createdAt: new Date().toISOString(),
      } satisfies Command;
    },
    async listWorkers(): Promise<WorkerRegistration[]> {
      return [];
    },
    async listWorkersForUser(): Promise<WorkerRegistration[]> {
      return [];
    },
  };
  const gitRepositories = {
    async touchWorkerRepository() {},
  };
  const dispatcher = {
    async dispatchQueuedCommands() {},
  };

  return {
    calls,
    service: new JiraIntakeService(
      jiraIntegrations as never,
      intakeEvents as never,
      workers as never,
      gitRepositories as never,
      dispatcher,
    ),
    stores: {
      intakeEvents,
      workers,
    },
  };
}

function setupDuplicateIssueService() {
  installRepositoryIssueFetchMock();
  const integrations: JiraIntegrationCredentials[] = [
    buildIntegration({ id: "integration-1", userId: "user-1" }),
    buildIntegration({ id: "integration-2", userId: "user-2" }),
  ];
  const intakeEvent = {
    id: "event-1",
    userId: "user-1",
    provider: "jira",
    integrationId: "integration-1",
    sourceItemId: "issue-1",
    sourceItemKey: "SCRUM-7",
    sourceItemUrl: "https://example.atlassian.net/browse/SCRUM-7",
    repositoryUrl: "https://github.com/example/repo.git",
    normalizedRepositoryUrl: "github.com/example/repo",
    status: "queueing",
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const intakeEvents = {
    beginCalls: [] as unknown[],
    markQueuedCalls: [] as unknown[],
    async begin(input: unknown) {
      this.beginCalls.push(input);
      if (this.beginCalls.length === 1) {
        return {
          event: intakeEvent,
          created: true,
        };
      }
      return {
        event: {
          ...intakeEvent,
          status: "queued",
          transactionId: "transaction-1",
        },
        created: false,
      };
    },
    async markQueued(id: string, transactionId: string) {
      this.markQueuedCalls.push({ id, transactionId });
      return {
        ...intakeEvent,
        status: "queued",
        transactionId,
      };
    },
    async markFailed() {
      throw new Error("markFailed should not be called");
    },
  };
  const workers = {
    commands: [] as unknown[],
    async createQueuedCommand(input: { userId: string; command: string; commandMode?: CommandMode }) {
      this.commands.push(input);
      return {
        transactionId: "transaction-1",
        userId: input.userId,
        command: input.command,
        commandMode: input.commandMode ?? "ai",
        status: "queued",
        createdAt: new Date().toISOString(),
      } satisfies Command;
    },
    async listWorkers(): Promise<WorkerRegistration[]> {
      return [];
    },
    async listWorkersForUser(): Promise<WorkerRegistration[]> {
      return [];
    },
  };
  const gitRepositories = {
    async touchWorkerRepository() {},
  };
  const dispatcher = {
    dispatchCalls: 0,
    async dispatchQueuedCommands() {
      this.dispatchCalls += 1;
    },
  };
  const jiraIntegrations = {
    listEnabledCredentials: async () => integrations,
    listAllEnabledCredentials: async () => integrations,
  };

  return {
    service: new JiraIntakeService(
      jiraIntegrations as never,
      intakeEvents as never,
      workers as never,
      gitRepositories as never,
      dispatcher,
    ),
    stores: {
      intakeEvents,
      workers,
      dispatcher,
    },
  };
}

function buildIntegration(overrides: Partial<JiraIntegrationCredentials>): JiraIntegrationCredentials {
  return {
    id: "integration-1",
    userId: "user-1",
    connected: true,
    enabled: true,
    siteUrl: "https://example.atlassian.net",
    email: "user@example.com",
    apiToken: "api-token",
    boardId: 1,
    boardName: "Board",
    boardType: "scrum",
    boardFilterId: 10,
    readyStatusId: "ready-id",
    readyStatusName: "Ready",
    processingStatusId: "doing-id",
    processingStatusName: "Doing",
    processedStatusId: "done-id",
    processedStatusName: "Done",
    ...overrides,
  };
}

function installRepositoryIssueFetchMock(): void {
  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);

    if (url.endsWith("/rest/api/3/field")) {
      return jsonResponse([
        {
          id: "customfield_10001",
          key: "customfield_10001",
          name: "Repository",
        },
      ]);
    }

    if (url.endsWith("/rest/api/3/search/jql")) {
      return jsonResponse({
        issues: [
          {
            id: "issue-1",
            key: "SCRUM-7",
            fields: {
              summary: "Build shared intake",
              status: {
                name: "Ready",
              },
              customfield_10001: "https://github.com/example/repo.git",
            },
          },
        ],
      });
    }

    return jsonResponse({ errorMessages: [`Unexpected Jira URL: ${url}`] }, 404);
  };
}

function installFetchMock(options: FetchOptions): FetchCall[] {
  const calls: FetchCall[] = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });

    if (url.endsWith("/rest/api/3/field")) {
      return jsonResponse([
        {
          id: "customfield_10001",
          key: "customfield_10001",
          name: "Repository",
        },
      ]);
    }

    if (url.endsWith("/rest/api/3/search/jql")) {
      return jsonResponse({
        issues: [
          {
            id: "issue-1",
            key: "SCRUM-7",
            fields: {
              summary: "Missing repository",
              status: {
                name: "Ready",
              },
            },
          },
        ],
      });
    }

    if (url.endsWith("/rest/api/3/issue/SCRUM-7/comment")) {
      return jsonResponse(
        options.commentStatus === undefined || options.commentStatus < 400 ? {} : { errorMessages: ["comment failed"] },
        options.commentStatus ?? 201,
      );
    }

    if (url.endsWith("/rest/api/3/issue/SCRUM-7/transitions") && method === "GET") {
      return jsonResponse({
        transitions: options.transitions ?? [
          {
            id: "31",
            name: "Done",
            to: {
              id: "done-id",
              name: "Done",
            },
          },
        ],
      });
    }

    if (url.endsWith("/rest/api/3/issue/SCRUM-7/transitions") && method === "POST") {
      return jsonResponse(
        options.transitionStatus === undefined || options.transitionStatus < 400 ? {} : { errorMessages: ["transition failed"] },
        options.transitionStatus ?? 204,
      );
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
  await testMissingRepositoryCommentsAndTransitions();
  await testMissingRepositoryDryRunDoesNotCallJiraWriteEndpoints();
  await testMissingRepositoryCommentFailureReturnsFailed();
  await testMissingRepositoryTransitionFailureReturnsFailed();
  await testMissingRepositoryWithoutProcessedStatusReturnsFailed();
  await testDuplicateIssueAcrossIntegrationsQueuesOneCommand();
} finally {
  globalThis.fetch = originalFetch;
}

console.log("jira intake service tests passed");
