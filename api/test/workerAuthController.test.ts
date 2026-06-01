import assert from "node:assert/strict";
import { WorkerAuthController } from "../src/controllers/workerAuth/workerAuthController.js";

async function testIssueTokenRequiresAuthenticatedUser(): Promise<void> {
  const controller = new WorkerAuthController(
    {} as never,
    {} as never,
    {
      async issue() {
        throw new Error("issue should not be called");
      },
    } as never,
    {} as never,
    "config-key",
  );
  const response = createResponse();

  await controller.issueToken(
    {
      body: {
        workerId: "worker-1",
      },
    } as never,
    response as never,
    (error?: unknown) => {
      if (error) throw error;
    },
  );

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: "authentication required" });
}

async function testIssueTokenUsesAuthenticatedUser(): Promise<void> {
  const issuedFor: Array<{ workerId: string; userId: string }> = [];
  const controller = new WorkerAuthController(
    {} as never,
    {} as never,
    {
      async issue(workerId: string, user: { userId: string }) {
        issuedFor.push({ workerId, userId: user.userId });
        return {
          accessToken: "worker-access",
          accessTokenExpiresIn: 3600,
          refreshToken: "worker-refresh",
          refreshTokenExpiresIn: 604800,
          tokenType: "Bearer",
        };
      },
    } as never,
    {} as never,
    "config-key",
  );
  const response = createResponse();

  await controller.issueToken(
    {
      user: {
        userId: "user-1",
        email: "user@example.com",
        role: "user",
        createdAt: new Date().toISOString(),
      },
      body: {
        workerId: " worker-1 ",
      },
    } as never,
    response as never,
    (error?: unknown) => {
      if (error) throw error;
    },
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(issuedFor, [{ workerId: "worker-1", userId: "user-1" }]);
  assert.deepEqual(response.body, {
    accessToken: "worker-access",
    accessTokenExpiresIn: 3600,
    refreshToken: "worker-refresh",
    refreshTokenExpiresIn: 604800,
    tokenType: "Bearer",
    configEncryptionKey: "config-key",
  });
}

async function testRegisterWorkerAcceptsUnlimitedCapacity(): Promise<void> {
  const registrations: unknown[] = [];
  const controller = new WorkerAuthController(
    {} as never,
    {
      async registerWorker(input: unknown) {
        registrations.push(input);
        return {
          workerId: "worker-1",
          userId: "user-1",
          connectionId: "http:worker-1",
          paths: [],
          skills: ["git"],
          enabledTaskTypes: ["gitflow"],
          state: "started",
          maxConcurrentTasks: null,
          activeTaskCount: 0,
          registeredAt: "2026-06-01T00:00:00.000Z",
          firstRegisteredAt: "2026-06-01T00:00:00.000Z",
          lastRegisteredAt: "2026-06-01T00:00:00.000Z",
          lastSeenAt: "2026-06-01T00:00:00.000Z",
          stateUpdatedAt: "2026-06-01T00:00:00.000Z",
        };
      },
      async markStaleWorkersStopped() {},
    } as never,
    {
      async verifyAccessToken() {
        return { workerId: "worker-1", userId: "user-1" };
      },
    } as never,
    {} as never,
    "config-key",
  );
  const response = createResponse();

  await controller.registerWorker(
    {
      headers: {
        authorization: "Bearer worker-token",
      },
      body: {
        workerId: "worker-1",
        skills: ["git"],
        enabledTaskTypes: ["gitflow"],
        maxConcurrentTasks: null,
      },
    } as never,
    response as never,
    (error?: unknown) => {
      if (error) throw error;
    },
  );

  assert.equal(response.statusCode, 200);
  assert.equal((registrations[0] as { maxConcurrentTasks?: number | null }).maxConcurrentTasks, null);
  assert.deepEqual((response.body as { maxConcurrentTasks?: number | null }).maxConcurrentTasks, null);
}

async function testClaimJiraTicketCreatesClaimAndStartsLifecycle(): Promise<void> {
  const claimCalls: unknown[] = [];
  const lifecycleCalls: unknown[] = [];
  const command = {
    transactionId: "transaction-1",
    userId: "user-1",
    workerId: "worker-1",
    command: "{}",
    commandMode: "gitflow",
    status: "in_progress",
    createdAt: new Date().toISOString(),
  };
  const controller = new WorkerAuthController(
    {} as never,
    {} as never,
    {
      async verifyAccessToken(token: string) {
        assert.equal(token, "worker-token");
        return {
          workerId: "worker-1",
          userId: "user-1",
        };
      },
    } as never,
    {} as never,
    "config-key",
    undefined,
    undefined,
    undefined,
    {
      async claim(input: unknown) {
        claimCalls.push(input);
        return {
          claimed: true,
          command,
          event: {
            id: "event-1",
            provider: "jira",
            sourceItemId: "issue-1",
            sourceItemKey: "FD-1",
            sourceItemUrl: "https://example.atlassian.net/browse/FD-1",
            repositoryUrl: "https://github.com/example/repo.git",
            normalizedRepositoryUrl: "github.com/example/repo",
            workerId: "worker-1",
            transactionId: "transaction-1",
            status: "processing",
            metadata: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        };
      },
    } as never,
    {
      async commandStarted(startedCommand: unknown) {
        lifecycleCalls.push(startedCommand);
      },
    } as never,
  );
  const response = createResponse();

  await controller.claimJiraTicket(
    {
      headers: {
        authorization: "Bearer worker-token",
      },
      body: {
        integrationId: "abc12",
        sourceItemId: "issue-1",
        sourceItemKey: "FD-1",
        sourceItemUrl: "https://example.atlassian.net/browse/FD-1",
        repositoryUrl: "https://github.com/example/repo.git",
        normalizedRepositoryUrl: "github.com/example/repo",
        command: "{}",
      },
    } as never,
    response as never,
    (error?: unknown) => {
      if (error) throw error;
    },
  );

  assert.equal(response.statusCode, 201);
  assert.deepEqual(claimCalls, [
    {
      workerId: "worker-1",
      userId: "user-1",
      integrationId: "abc12",
      sourceItemId: "issue-1",
      sourceItemKey: "FD-1",
      sourceItemUrl: "https://example.atlassian.net/browse/FD-1",
      repositoryUrl: "https://github.com/example/repo.git",
      normalizedRepositoryUrl: "github.com/example/repo",
      command: "{}",
      metadata: undefined,
    },
  ]);
  assert.deepEqual(lifecycleCalls, [command]);
  assert.deepEqual(response.body, {
    claimed: true,
    transactionId: "transaction-1",
    eventId: "event-1",
    command,
  });
}

async function testClaimJiraTicketReturnsConflictForDuplicateClaim(): Promise<void> {
  const controller = new WorkerAuthController(
    {} as never,
    {} as never,
    {
      async verifyAccessToken() {
        return {
          workerId: "worker-2",
          userId: "user-2",
        };
      },
    } as never,
    {} as never,
    "config-key",
    undefined,
    undefined,
    undefined,
    {
      async claim() {
        return {
          claimed: false,
          event: {
            id: "event-1",
            provider: "jira",
            sourceItemId: "issue-1",
            sourceItemKey: "FD-1",
            sourceItemUrl: "https://example.atlassian.net/browse/FD-1",
            repositoryUrl: "https://github.com/example/repo.git",
            normalizedRepositoryUrl: "github.com/example/repo",
            workerId: "worker-1",
            transactionId: "transaction-1",
            status: "processing",
            metadata: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        };
      },
    } as never,
  );
  const response = createResponse();

  await controller.claimJiraTicket(
    {
      headers: {
        authorization: "Bearer worker-token",
      },
      body: {
        integrationId: "abc12",
        sourceItemId: "issue-1",
        sourceItemKey: "FD-1",
        sourceItemUrl: "https://example.atlassian.net/browse/FD-1",
        repositoryUrl: "https://github.com/example/repo.git",
        normalizedRepositoryUrl: "github.com/example/repo",
        command: "{}",
      },
    } as never,
    response as never,
    (error?: unknown) => {
      if (error) throw error;
    },
  );

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.body, {
    claimed: false,
    event: {
      id: "event-1",
      status: "processing",
      workerId: "worker-1",
      transactionId: "transaction-1",
    },
  });
}

async function testClaimJiraTicketRejectsUnownedIntegration(): Promise<void> {
  const controller = new WorkerAuthController(
    {} as never,
    {} as never,
    {
      async verifyAccessToken() {
        return {
          workerId: "worker-2",
          userId: "user-2",
        };
      },
    } as never,
    {} as never,
    "config-key",
    undefined,
    undefined,
    {
      async getCredentials() {
        return undefined;
      },
    } as never,
    {
      async claim() {
        throw new Error("claim should not be called");
      },
    } as never,
  );
  const response = createResponse();

  await controller.claimJiraTicket(
    {
      headers: {
        authorization: "Bearer worker-token",
      },
      body: {
        integrationId: "abc12",
        sourceItemId: "issue-1",
        sourceItemKey: "FD-1",
        sourceItemUrl: "https://example.atlassian.net/browse/FD-1",
        repositoryUrl: "https://github.com/example/repo.git",
        normalizedRepositoryUrl: "github.com/example/repo",
        command: "{}",
      },
    } as never,
    response as never,
    (error?: unknown) => {
      if (error) throw error;
    },
  );

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { error: "Jira integration does not belong to this worker" });
}

function createResponse(): {
  statusCode: number;
  headers: Record<string, string>;
  body?: unknown;
  status(statusCode: number): { json(body: unknown): void };
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
  send(body: unknown): void;
} {
  return {
    statusCode: 200,
    headers: {},
    status(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    json(body: unknown) {
      this.body = body;
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    },
    send(body: unknown) {
      this.body = body;
    },
  };
}

await testIssueTokenRequiresAuthenticatedUser();
await testIssueTokenUsesAuthenticatedUser();
await testRegisterWorkerAcceptsUnlimitedCapacity();
await testClaimJiraTicketCreatesClaimAndStartsLifecycle();
await testClaimJiraTicketReturnsConflictForDuplicateClaim();
await testClaimJiraTicketRejectsUnownedIntegration();

console.log("worker auth controller tests passed");
