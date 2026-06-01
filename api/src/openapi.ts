export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Firstdraft API",
    version: "0.1.0"
  },
  servers: [
    {
      url: "http://localhost:5080",
      description: "Local development"
    }
  ],
  tags: [
    { name: "System" },
    { name: "Auth" },
    { name: "Worker Auth" },
    { name: "Workers" },
    { name: "Integrations" }
  ],
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Health check",
        responses: {
          "200": jsonResponse("Service health", ref("HealthResponse"))
        }
      }
    },
    "/api/auth/signup": {
      post: {
        tags: ["Auth"],
        summary: "Create a user account",
        requestBody: jsonBody(ref("SignupRequest"), true),
        responses: {
          "201": jsonResponse("Created user and JWT", ref("AuthResponse")),
          "400": errorResponse(),
          "409": errorResponse()
        }
      }
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in with email and password",
        requestBody: jsonBody(ref("LoginRequest"), true),
        responses: {
          "200": jsonResponse("JWT and current user", ref("AuthResponse")),
          "401": errorResponse()
        }
      }
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get the current authenticated user",
        security: bearerSecurity(),
        responses: {
          "200": jsonResponse("Current user", object({ user: ref("User") }, ["user"])),
          "401": errorResponse()
        }
      },
      patch: {
        tags: ["Auth"],
        summary: "Update the current authenticated user",
        security: bearerSecurity(),
        requestBody: jsonBody(ref("UpdateProfileRequest"), true),
        responses: {
          "200": jsonResponse("Updated user", object({ user: ref("User") }, ["user"])),
          "400": errorResponse(),
          "401": errorResponse(),
          "404": errorResponse(),
          "409": errorResponse()
        }
      },
      delete: {
        tags: ["Auth"],
        summary: "Delete the current authenticated user and data",
        security: bearerSecurity(),
        responses: {
          "204": { description: "Profile deleted" },
          "401": errorResponse(),
          "404": errorResponse()
        }
      }
    },
    "/api/worker-auth/token": {
      post: {
        tags: ["Worker Auth"],
        summary: "Exchange user authentication for worker tokens",
        security: bearerSecurity(),
        requestBody: jsonBody(ref("WorkerTokenRequest"), true),
        responses: {
          "200": jsonResponse("Worker token pair", ref("WorkerTokenResponse")),
          "400": errorResponse(),
          "401": errorResponse()
        }
      }
    },
    "/api/worker-auth/refresh": {
      post: {
        tags: ["Worker Auth"],
        summary: "Refresh a worker access token",
        requestBody: jsonBody(ref("RefreshTokenRequest"), true),
        responses: {
          "200": jsonResponse("Worker token pair", ref("WorkerTokenPair")),
          "400": errorResponse(),
          "401": errorResponse()
        }
      }
    },
    "/api/worker-auth/public-key": {
      get: {
        tags: ["Worker Auth"],
        summary: "Get the API-to-worker public key",
        responses: {
          "200": jsonResponse("Public key", ref("WorkerPublicKeyResponse"))
        }
      }
    },
    "/api/worker-auth/register": {
      post: {
        tags: ["Worker Auth"],
        summary: "Register or refresh worker metadata",
        security: bearerSecurity(),
        requestBody: jsonBody(ref("WorkerRegistrationReport"), true),
        responses: {
          "200": jsonResponse("Registered worker", ref("WorkerRegistration")),
          "400": errorResponse(),
          "401": errorResponse(),
          "403": errorResponse()
        }
      }
    },
    "/api/worker-auth/heartbeat": {
      post: {
        tags: ["Worker Auth"],
        summary: "Refresh worker heartbeat",
        security: bearerSecurity(),
        responses: {
          "200": jsonResponse("Worker state", ref("WorkerRegistration")),
          "401": errorResponse(),
          "404": errorResponse()
        }
      }
    },
    "/api/worker-auth/tasks/start": {
      post: {
        tags: ["Worker Auth"],
        summary: "Report a worker-started task",
        security: bearerSecurity(),
        requestBody: jsonBody(ref("TaskStartReport"), true),
        responses: {
          "201": jsonResponse("Started task", ref("TaskStartResponse")),
          "400": errorResponse(),
          "401": errorResponse(),
          "403": errorResponse(),
          "409": errorResponse()
        }
      }
    },
    "/api/worker-auth/tasks/{transactionId}/output": {
      post: {
        tags: ["Worker Auth"],
        summary: "Append worker task output",
        security: bearerSecurity(),
        parameters: [pathParam("transactionId", "Transaction id")],
        requestBody: jsonBody(ref("TaskOutputChunk"), true),
        responses: {
          "202": jsonResponse("Accepted output chunk", ref("OkResponse")),
          "204": { description: "Output storage is not configured" },
          "400": errorResponse(),
          "401": errorResponse(),
          "404": errorResponse()
        }
      }
    },
    "/api/worker-auth/tasks/{transactionId}/complete": {
      post: {
        tags: ["Worker Auth"],
        summary: "Complete a worker task",
        security: bearerSecurity(),
        parameters: [pathParam("transactionId", "Transaction id")],
        requestBody: jsonBody(ref("TaskCompleteReport"), true),
        responses: {
          "200": jsonResponse("Completed command", ref("Command")),
          "401": errorResponse(),
          "404": errorResponse()
        }
      }
    },
    "/api/worker-auth/tasks/{transactionId}/reject": {
      post: {
        tags: ["Worker Auth"],
        summary: "Reject a worker task",
        security: bearerSecurity(),
        parameters: [pathParam("transactionId", "Transaction id")],
        requestBody: jsonBody(object({ reason: { type: "string" } }), false),
        responses: {
          "200": jsonResponse("Rejected command", ref("Command")),
          "401": errorResponse(),
          "404": errorResponse()
        }
      }
    },
    "/api/workers": {
      get: {
        tags: ["Workers"],
        summary: "List registered workers for the current user",
        security: bearerSecurity(),
        responses: {
          "200": jsonResponse("Workers", array(ref("WorkerRegistration"))),
          "401": errorResponse()
        }
      }
    },
    "/api/workers/task-queue": {
      get: {
        tags: ["Workers"],
        summary: "List task queue entries for the current user",
        security: bearerSecurity(),
        parameters: [
          queryParam("page", "Zero-based page index", { type: "integer", minimum: 0, default: 0 }),
          queryParam("pageSize", "Rows per page", { type: "integer", enum: [5, 10, 25, 50], default: 10 }),
          queryParam("status", "Command statuses to include. Repeat this parameter to select multiple statuses. Defaults to queued and in_progress.", {
            type: "array",
            items: { type: "string", enum: ["queued", "in_progress", "completed", "failed"] },
            default: ["queued", "in_progress"]
          }),
          queryParam("sortBy", "Task queue column to sort by. Defaults to queue priority ordering when omitted.", {
            type: "string",
            enum: ["status", "source", "task", "worker", "repository", "created"]
          }),
          queryParam("sortDirection", "Sort direction. Used only with sortBy.", {
            type: "string",
            enum: ["asc", "desc"]
          })
        ],
        responses: {
          "200": jsonResponse("Task queue", ref("PaginatedCommands")),
          "401": errorResponse()
        }
      }
    },
    "/api/workers/{workerId}/state": workerGet("Get worker state", ref("WorkerRegistration")),
    "/api/workers/{workerId}/commands": {
      get: {
        tags: ["Workers"],
        summary: "List worker commands",
        security: bearerSecurity(),
        parameters: [
          pathParam("workerId", "Worker id"),
          queryParam("page", "Zero-based page index", { type: "integer", minimum: 0, default: 0 }),
          queryParam("pageSize", "Rows per page", { type: "integer", enum: [5, 10, 25, 50], default: 10 })
        ],
        responses: {
          "200": jsonResponse("Commands", ref("PaginatedCommands")),
          "401": errorResponse(),
          "404": errorResponse()
        }
      }
    },
    "/api/workers/{workerId}/commands/{transactionId}": workerCommandGet("Get a worker command", ref("Command")),
    "/api/workers/{workerId}/commands/{transactionId}/output": {
      get: {
        tags: ["Workers"],
        summary: "Stream command output",
        security: bearerSecurity(),
        parameters: workerCommandParams(),
        responses: {
          "200": {
            description: "Command output stream",
            content: {
              "worker/x-ndjson": { schema: { type: "string" } },
              "text/plain": { schema: { type: "string" } },
              "application/octet-stream": { schema: { type: "string", format: "binary" } }
            }
          },
          "401": errorResponse(),
          "404": errorResponse(),
          "503": errorResponse()
        }
      }
    },
    "/api/workers/{workerId}/commands/{transactionId}/responses": workerCommandGet(
      "Read command responses parsed from output",
      ref("CommandResponses")
    )
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    },
    schemas: {
      HealthResponse: object({ ok: { type: "boolean" } }, ["ok"]),
      OkResponse: object({ ok: { type: "boolean" } }, ["ok"]),
      ErrorResponse: object({ error: { type: "string" } }, ["error"]),
      SignupRequest: object({ email: { type: "string", format: "email" }, password: { type: "string", minLength: 8 }, name: { type: "string" } }, ["email", "password"]),
      LoginRequest: object({ email: { type: "string", format: "email" }, password: { type: "string" } }, ["email", "password"]),
      UpdateProfileRequest: object({ email: { type: "string", format: "email" }, name: { type: "string" }, password: { type: "string", minLength: 8 } }),
      AuthResponse: object({
        token: { type: "string" },
        tokenType: { type: "string", example: "Bearer" },
        expiresIn: { type: "string" },
        user: ref("User")
      }, ["token", "tokenType", "expiresIn", "user"]),
      User: object({
        userId: { type: "string" },
        email: { type: "string", format: "email" },
        name: { type: "string" },
        role: { type: "string", enum: ["admin", "user"] },
        createdAt: { type: "string", format: "date-time" },
        disabledAt: { type: "string", format: "date-time" }
      }, ["userId", "email", "role", "createdAt"]),
      WorkerTokenRequest: object({ workerId: { type: "string" } }, ["workerId"]),
      RefreshTokenRequest: object({ refreshToken: { type: "string" } }, ["refreshToken"]),
      WorkerTokenPair: object({ accessToken: { type: "string" }, refreshToken: { type: "string" }, expiresIn: { type: "string" } }, ["accessToken", "refreshToken"]),
      WorkerTokenResponse: object({
        accessToken: { type: "string" },
        refreshToken: { type: "string" },
        expiresIn: { type: "string" },
        configEncryptionKey: { type: "string" }
      }, ["accessToken", "refreshToken", "configEncryptionKey"]),
      WorkerPublicKeyResponse: object({ alg: { type: "string", example: "RS256" }, publicKey: { type: "string" } }, ["alg", "publicKey"]),
      WorkerRegistrationReport: object({
        workerId: { type: "string" },
        paths: array({ type: "string" }),
        skills: array({ type: "string" }),
        enabledTaskTypes: array({ type: "string", enum: ["ai", "shell", "gitflow"] }),
        maxConcurrentTasks: nullable({ type: "integer" }),
        gitRepositories: array(freeForm()),
        jiraIntegrations: array(freeForm())
      }, ["workerId"]),
      TaskStartReport: object({
        provider: { type: "string" },
        integrationId: { type: "string" },
        sourceItemId: { type: "string" },
        sourceItemKey: { type: "string" },
        sourceItemUrl: { type: "string" },
        repositoryUrl: { type: "string" },
        normalizedRepositoryUrl: { type: "string" },
        command: { type: "string" },
        executionCommand: { type: "string" },
        commandMode: { type: "string", enum: ["ai", "shell", "gitflow"] },
        metadata: freeForm()
      }, ["command", "commandMode"]),
      TaskStartResponse: object({
        claimed: { type: "boolean" },
        transactionId: { type: "string" },
        eventId: { type: "string" },
        command: ref("Command")
      }, ["transactionId", "command"]),
      TaskOutputChunk: object({
        sequence: { type: "integer" },
        stream: { type: "string", enum: ["stdout", "stderr"] },
        text: { type: "string" },
        emittedAt: { type: "string", format: "date-time" }
      }, ["sequence", "stream", "text"]),
      TaskCompleteReport: object({
        result: nullable({ type: "string" }),
        errorMessage: nullable({ type: "string" })
      }),
      WorkerRegistration: object({
        workerId: { type: "string" },
        userId: { type: "string" },
        connectionId: { type: "string" },
        paths: array({ type: "string" }),
        skills: array({ type: "string" }),
        enabledTaskTypes: array({ type: "string", enum: ["ai", "shell", "gitflow"] }),
        state: { type: "string", enum: ["started", "running_command", "stopped"] },
        currentTransactionId: { type: "string" },
        activeTransactionIds: array({ type: "string" }),
        maxConcurrentTasks: nullable({ type: "integer" }),
        activeTaskCount: { type: "integer" },
        registeredAt: { type: "string", format: "date-time" },
        firstRegisteredAt: { type: "string", format: "date-time" },
        lastRegisteredAt: { type: "string", format: "date-time" },
        lastSeenAt: { type: "string", format: "date-time" },
        stateUpdatedAt: { type: "string", format: "date-time" },
        stoppedAt: { type: "string", format: "date-time" }
      }, ["workerId", "userId", "connectionId", "paths", "skills", "enabledTaskTypes", "state", "registeredAt", "firstRegisteredAt", "lastRegisteredAt", "lastSeenAt", "stateUpdatedAt"]),
      Command: object({
        transactionId: { type: "string" },
        userId: { type: "string" },
        workerId: { type: "string" },
        command: { type: "string" },
        taskSummary: { type: "string" },
        executionCommand: nullable({ type: "string" }),
        commandMode: { type: "string", enum: ["ai", "shell", "gitflow"] },
        repositoryUrl: { type: "string" },
        normalizedRepositoryUrl: { type: "string" },
        status: { type: "string", enum: ["queued", "in_progress", "completed", "failed"] },
        createdAt: { type: "string", format: "date-time" },
        claimedAt: { type: "string", format: "date-time" },
        completedAt: { type: "string", format: "date-time" },
        result: nullable({ type: "string" }),
        agentResponse: nullable({ type: "string" }),
        errorMessage: nullable({ type: "string" }),
        outputObjectKey: { type: "string" },
        outputBytes: { type: "integer" },
        outputStartedAt: { type: "string", format: "date-time" },
        outputUpdatedAt: { type: "string", format: "date-time" }
      }, ["transactionId", "userId", "command", "commandMode", "status", "createdAt"]),
      PaginatedCommands: object({
        commands: array(ref("Command")),
        total: { type: "integer" },
        page: { type: "integer" },
        pageSize: { type: "integer" }
      }, ["commands", "total", "page", "pageSize"]),
      CommandResponses: object({ command: ref("Command"), responses: array(freeForm()) }, ["command", "responses"])
    }
  }
} as const;

export function swaggerHtml(swaggerJsonPath = "/swagger.json"): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Firstdraft API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "${swaggerJsonPath}",
        dom_id: "#swagger-ui",
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis],
        layout: "BaseLayout"
      });
    </script>
  </body>
</html>`;
}

type Schema = Record<string, unknown>;

function ref(name: string): Schema {
  return { $ref: `#/components/schemas/${name}` };
}

function object(properties: Record<string, Schema>, required: string[] = []): Schema {
  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {})
  };
}

function array(items: Schema): Schema {
  return { type: "array", items };
}

function nullable(schema: Schema): Schema {
  return { ...schema, nullable: true };
}

function freeForm(): Schema {
  return { type: "object", additionalProperties: true };
}

function bearerSecurity(): Array<Record<string, never[]>> {
  return [{ bearerAuth: [] }];
}

function jsonBody(schema: Schema, required: boolean): Schema {
  return {
    required,
    content: {
      "application/json": {
        schema
      }
    }
  };
}

function jsonResponse(description: string, schema: Schema): Schema {
  return {
    description,
    content: {
      "application/json": {
        schema
      }
    }
  };
}

function errorResponse(): Schema {
  return jsonResponse("Error", ref("ErrorResponse"));
}

function pathParam(name: string, description: string): Schema {
  return {
    name,
    in: "path",
    required: true,
    description,
    schema: { type: "string" }
  };
}

function queryParam(name: string, description: string, schema: Schema): Schema {
  return {
    name,
    in: "query",
    required: false,
    description,
    schema
  };
}

function workerGet(summary: string, schema: Schema): Schema {
  return {
    get: {
      tags: ["Workers"],
      summary,
      security: bearerSecurity(),
      parameters: [pathParam("workerId", "Worker id")],
      responses: {
        "200": jsonResponse(summary, schema),
        "401": errorResponse(),
        "404": errorResponse()
      }
    }
  };
}

function workerCommandParams(): Schema[] {
  return [
    pathParam("workerId", "Worker id"),
    pathParam("transactionId", "Command transaction id")
  ];
}

function workerCommandGet(summary: string, schema: Schema): Schema {
  return {
    get: {
      tags: ["Workers"],
      summary,
      security: bearerSecurity(),
      parameters: workerCommandParams(),
      responses: {
        "200": jsonResponse(summary, schema),
        "401": errorResponse(),
        "404": errorResponse(),
        "503": errorResponse()
      }
    }
  };
}
