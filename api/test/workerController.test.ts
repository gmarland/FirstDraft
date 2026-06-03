import assert from "node:assert/strict";
import { WorkerController } from "../src/controllers/workers/workerController.js";

async function testWorkerStateIncludesRegisteredResources(): Promise<void> {
  const controller = new WorkerController(
    {
      async getWorkerForUser(userId: string, workerId: string) {
        assert.equal(userId, "user-1");
        assert.equal(workerId, "worker-1");
        return {
          workerId: "worker-1",
          userId: "user-1",
          connectionId: "http:worker-1",
          paths: ["/repo"],
          skills: ["git"],
          enabledTaskTypes: ["gitflow"],
          state: "started",
          activeTransactionIds: [],
          activeTaskCount: 0,
          maxConcurrentTasks: 2,
          registeredAt: "2026-06-01T00:00:00.000Z",
          firstRegisteredAt: "2026-06-01T00:00:00.000Z",
          lastRegisteredAt: "2026-06-01T00:00:00.000Z",
          lastSeenAt: "2026-06-01T00:00:00.000Z",
          stateUpdatedAt: "2026-06-01T00:00:00.000Z",
        };
      },
    } as never,
    undefined,
    {
      async listGitflowSuggestions(workerId: string) {
        assert.equal(workerId, "worker-1");
        return [
          {
            repositoryUrl: "https://github.com/example/repo.git",
            normalizedRepositoryUrl: "github.com/example/repo",
            sourceBranch: "main",
            targetBranch: "develop",
            lastUsedAt: "2026-06-01T00:01:00.000Z",
          },
        ];
      },
    } as never,
    {
      async listWorkerSettings(userId: string, workerId: string) {
        assert.equal(userId, "user-1");
        assert.equal(workerId, "worker-1");
        return [
          {
            id: "abc12",
            workerId: "worker-1",
            connected: true,
            enabled: true,
            siteUrl: "https://example.atlassian.net",
            email: "jira-user@example.com",
            boardId: 12,
            boardName: "FirstDraft",
            boardType: "scrum",
            readyStatusId: "1",
            readyStatusName: "Ready",
            processingStatusId: "2",
            processingStatusName: "In Progress",
            processedStatusId: "3",
            processedStatusName: "Done",
            assignees: [
              {
                accountId: "account-1",
                displayName: "Jira User",
                emailAddress: "assignee@example.com",
              },
            ],
            updatedAt: "2026-06-01T00:02:00.000Z",
          },
        ];
      },
    } as never,
  );
  const response = createResponse();

  await controller.getWorkerState(
    {
      user: {
        userId: "user-1",
        email: "user@example.com",
        role: "user",
        createdAt: "2026-06-01T00:00:00.000Z",
      },
      params: {
        workerId: "worker-1",
      },
    } as never,
    response as never,
    (error?: unknown) => {
      if (error) throw error;
    },
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual((response.body as { gitRepositories: unknown[] }).gitRepositories, [
    {
      repositoryUrl: "https://github.com/example/repo.git",
      normalizedRepositoryUrl: "github.com/example/repo",
      sourceBranch: "main",
      targetBranch: "develop",
      lastUsedAt: "2026-06-01T00:01:00.000Z",
    },
  ]);
  assert.deepEqual((response.body as { jiraIntegrations: unknown[] }).jiraIntegrations, [
    {
      provider: "jira",
      id: "abc12",
      connected: true,
      enabled: true,
      siteUrl: "https://example.atlassian.net",
      boardName: "FirstDraft",
      boardType: "scrum",
      readyStatusName: "Ready",
      processingStatusName: "In Progress",
      processedStatusName: "Done",
      assigneeCount: 1,
      updatedAt: "2026-06-01T00:02:00.000Z",
    },
  ]);
  assert.equal(JSON.stringify(response.body).includes("jira-user@example.com"), false);
  assert.equal(JSON.stringify(response.body).includes("assignee@example.com"), false);
}

async function testArchiveIdleWorker(): Promise<void> {
  let archivedWorkerId: string | undefined;
  const controller = new WorkerController({
    async getWorkerForUser(userId: string, workerId: string) {
      assert.equal(userId, "user-1");
      assert.equal(workerId, "worker-1");
      return workerRegistration({ state: "started" });
    },
    async archiveIdleWorkerForUser(userId: string, workerId: string) {
      assert.equal(userId, "user-1");
      archivedWorkerId = workerId;
      return true;
    },
  } as never);
  const response = createResponse();

  await controller.archiveWorker(
    requestForWorker("worker-1") as never,
    response as never,
    throwOnError,
  );

  assert.equal(response.statusCode, 204);
  assert.equal(archivedWorkerId, "worker-1");
}

async function testArchiveWorkerReturnsNotFoundForOtherUsersWorker(): Promise<void> {
  const controller = new WorkerController({
    async getWorkerForUser() {
      return undefined;
    },
  } as never);
  const response = createResponse();

  await controller.archiveWorker(
    requestForWorker("worker-1") as never,
    response as never,
    throwOnError,
  );

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: "worker is not registered" });
}

async function testArchiveWorkerRejectsNonIdleWorker(): Promise<void> {
  let archiveCalled = false;
  const controller = new WorkerController({
    async getWorkerForUser() {
      return workerRegistration({ state: "running_command" });
    },
    async archiveIdleWorkerForUser() {
      archiveCalled = true;
      return true;
    },
  } as never);
  const response = createResponse();

  await controller.archiveWorker(
    requestForWorker("worker-1") as never,
    response as never,
    throwOnError,
  );

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.body, { error: "only idle workers can be archived" });
  assert.equal(archiveCalled, false);
}

async function testArchiveWorkerRejectsStoppedWorker(): Promise<void> {
  const controller = new WorkerController({
    async getWorkerForUser() {
      return workerRegistration({ state: "stopped" });
    },
  } as never);
  const response = createResponse();

  await controller.archiveWorker(
    requestForWorker("worker-1") as never,
    response as never,
    throwOnError,
  );

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.body, { error: "only idle workers can be archived" });
}

function requestForWorker(workerId: string) {
  return {
    user: {
      userId: "user-1",
      email: "user@example.com",
      role: "user",
      createdAt: "2026-06-01T00:00:00.000Z",
    },
    params: {
      workerId,
    },
  };
}

function workerRegistration(overrides: { state?: "started" | "running_command" | "stopped" } = {}) {
  return {
    workerId: "worker-1",
    userId: "user-1",
    connectionId: "http:worker-1",
    paths: ["/repo"],
    skills: ["git"],
    enabledTaskTypes: ["gitflow"],
    state: overrides.state ?? "started",
    activeTransactionIds: [],
    activeTaskCount: 0,
    maxConcurrentTasks: 2,
    registeredAt: "2026-06-01T00:00:00.000Z",
    firstRegisteredAt: "2026-06-01T00:00:00.000Z",
    lastRegisteredAt: "2026-06-01T00:00:00.000Z",
    lastSeenAt: "2026-06-01T00:00:00.000Z",
    stateUpdatedAt: "2026-06-01T00:00:00.000Z",
  };
}

function throwOnError(error?: unknown): void {
  if (error) throw error;
}

function createResponse(): {
  statusCode: number;
  body?: unknown;
  status(statusCode: number): { json(body: unknown): void };
  json(body: unknown): void;
  send(): void;
} {
  return {
    statusCode: 200,
    status(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    json(body: unknown) {
      this.body = body;
    },
    send() {
      this.body = undefined;
    },
  };
}

await testWorkerStateIncludesRegisteredResources();
await testArchiveIdleWorker();
await testArchiveWorkerReturnsNotFoundForOtherUsersWorker();
await testArchiveWorkerRejectsNonIdleWorker();
await testArchiveWorkerRejectsStoppedWorker();

console.log("worker controller tests passed");
