import assert from "node:assert/strict";
import { WorkerAuthController } from "../src/controllers/workerAuth/workerAuthController.js";

const originalFetch = globalThis.fetch;

async function testJiraAttachmentUsesWorkerParticipantIntegration(): Promise<void> {
  const intakeEvents = {
    calls: [] as Array<{ eventId: string; workerId: string; userId: string }>,
    async getByIdForWorker(eventId: string, workerId: string, userId: string) {
      this.calls.push({ eventId, workerId, userId });
      return {
        event: {
          id: eventId,
          provider: "jira",
          sourceItemId: "issue-1",
          sourceItemKey: "SCRUM-7",
          repositoryUrl: "https://github.com/example/repo.git",
          normalizedRepositoryUrl: "github.com/example/repo",
          workerId,
          transactionId: "transaction-1",
          status: "processing",
          metadata: {
            imageAttachments: [
              {
                id: "attachment-1",
                filename: "screenshot.png",
                mimeType: "image/png",
                contentUrl: "https://example.atlassian.net/attachment/content/attachment-1",
              },
            ],
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        participant: {
          eventId,
          userId: "user-b",
          integrationId: "integration-b",
        },
      };
    },
  };
  const jiraIntegrations = {
    calls: [] as Array<{ userId: string; integrationId: string }>,
    async getCredentials(userId: string, integrationId: string) {
      this.calls.push({ userId, integrationId });
      return {
        siteUrl: "https://example.atlassian.net",
        email: "user-b@example.com",
        apiToken: "token-b",
      };
    },
  };
  installFetchMock();
  const controller = new WorkerAuthController(
    {} as never,
    {
      async verifyAccessToken(token: string) {
        assert.equal(token, "worker-token");
        return {
          workerId: "worker-b",
          userId: "user-b",
          apiKeyId: "api-key-b",
        };
      },
    } as never,
    {} as never,
    "config-key",
    intakeEvents as never,
    jiraIntegrations as never,
  );
  const response = createResponse();

  await controller.downloadJiraAttachment(
    {
      headers: {
        authorization: "Bearer worker-token",
      },
      params: {
        eventId: "event-1",
        attachmentId: "attachment-1",
      },
    } as never,
    response as never,
    (error?: unknown) => {
      if (error) throw error;
    },
  );

  assert.deepEqual(intakeEvents.calls, [
    { eventId: "event-1", workerId: "worker-b", userId: "user-b" },
  ]);
  assert.deepEqual(jiraIntegrations.calls, [
    { userId: "user-b", integrationId: "integration-b" },
  ]);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "image/png");
  assert.deepEqual(response.body, Buffer.from("image-bytes"));
}

function installFetchMock(): void {
  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    assert.equal(String(input), "https://example.atlassian.net/attachment/content/attachment-1");
    return {
      ok: true,
      status: 200,
      headers: {
        get(name: string) {
          return name.toLowerCase() === "content-type" ? "image/png" : null;
        },
      },
      async arrayBuffer() {
        return Buffer.from("image-bytes");
      },
    } as Response;
  };
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

try {
  await testJiraAttachmentUsesWorkerParticipantIntegration();
} finally {
  globalThis.fetch = originalFetch;
}

console.log("worker auth controller tests passed");
