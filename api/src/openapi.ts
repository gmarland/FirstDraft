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
    { name: "API Keys" },
    { name: "Workers" },
    { name: "Repositories" },
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
    "/WorkerHub/negotiate": {
      post: {
        tags: ["Workers"],
        summary: "Negotiate a SignalR worker hub connection",
        responses: {
          "200": jsonResponse("Negotiation payload", freeForm()),
          "401": errorResponse()
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
    "/api/me/api-keys": {
      get: {
        tags: ["API Keys"],
        summary: "List API keys visible to the current user",
        security: bearerSecurity(),
        responses: {
          "200": jsonResponse("API keys", array(ref("ApiKey"))),
          "401": errorResponse()
        }
      },
      post: {
        tags: ["API Keys"],
        summary: "Create a user API key",
        security: bearerSecurity(),
        requestBody: jsonBody(ref("CreateApiKeyRequest"), false),
        responses: {
          "201": jsonResponse("Created API key", ref("ApiKey")),
          "401": errorResponse()
        }
      }
    },
    "/api/me/api-keys/{keyId}": {
      delete: {
        tags: ["API Keys"],
        summary: "Revoke an API key",
        security: bearerSecurity(),
        parameters: [pathParam("keyId", "API key id")],
        responses: {
          "200": jsonResponse("Revoked API key", ref("ApiKey")),
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
    "/api/workers/disable-all": {
      post: {
        tags: ["Workers"],
        summary: "Disable all enabled workers for the current user",
        security: bearerSecurity(),
        responses: {
          "200": jsonResponse("Disabled workers", array(ref("WorkerRegistration"))),
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
    "/api/workers/{workerId}": {
      patch: {
        tags: ["Workers"],
        summary: "Enable or disable a worker",
        security: bearerSecurity(),
        parameters: [pathParam("workerId", "Worker id")],
        requestBody: jsonBody(ref("SetWorkerEnabledRequest"), true),
        responses: {
          "200": jsonResponse("Updated worker", ref("WorkerRegistration")),
          "400": errorResponse(),
          "401": errorResponse(),
          "404": errorResponse()
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
      },
      post: {
        tags: ["Workers"],
        summary: "Queue a worker command",
        security: bearerSecurity(),
        parameters: [pathParam("workerId", "Worker id")],
        requestBody: jsonBody(ref("CreateCommandRequest"), true),
        responses: {
          "202": jsonResponse("Queued command", ref("Command")),
          "400": errorResponse(),
          "401": errorResponse(),
          "404": errorResponse()
        }
      }
    },
    "/api/workers/{workerId}/gitflow-suggestions": workerGet(
      "List gitflow repository suggestions for a worker",
      object({ repositories: array(ref("GitRepositorySuggestion")) }, ["repositories"])
    ),
    "/api/workers/{workerId}/commands/{transactionId}": workerCommandGet("Get a worker command", ref("Command")),
    "/api/workers/{workerId}/commands/{transactionId}/cancel": {
      post: {
        tags: ["Workers"],
        summary: "Cancel a worker command",
        security: bearerSecurity(),
        parameters: workerCommandParams(),
        requestBody: jsonBody(ref("CancelCommandRequest"), false),
        responses: {
          "200": jsonResponse("Cancelled command", ref("Command")),
          "401": errorResponse(),
          "404": errorResponse()
        }
      }
    },
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
    ),
    "/api/repositories": {
      get: {
        tags: ["Repositories"],
        summary: "List Git repositories",
        security: bearerSecurity(),
        responses: {
          "200": jsonResponse("Repositories", object({ repositories: array(ref("GitRepository")) }, ["repositories"])),
          "401": errorResponse()
        }
      },
      post: {
        tags: ["Repositories"],
        summary: "Create or update a Git repository",
        security: bearerSecurity(),
        requestBody: jsonBody(ref("SaveGitRepositoryRequest"), true),
        responses: {
          "201": jsonResponse("Saved repository", ref("GitRepository")),
          "400": errorResponse(),
          "401": errorResponse()
        }
      }
    },
    "/api/repositories/{normalizedRepositoryUrl}": {
      put: {
        tags: ["Repositories"],
        summary: "Update a Git repository",
        security: bearerSecurity(),
        parameters: [pathParam("normalizedRepositoryUrl", "Normalized repository URL")],
        requestBody: jsonBody(ref("SaveGitRepositoryRequest"), true),
        responses: {
          "200": jsonResponse("Saved repository", ref("GitRepository")),
          "400": errorResponse(),
          "401": errorResponse(),
          "404": errorResponse()
        }
      },
      delete: {
        tags: ["Repositories"],
        summary: "Delete a Git repository",
        security: bearerSecurity(),
        parameters: [pathParam("normalizedRepositoryUrl", "Normalized repository URL")],
        responses: {
          "204": { description: "Deleted" },
          "401": errorResponse(),
          "404": errorResponse()
        }
      }
    },
    "/api/integrations": integrationGet("List integration settings", object({ jira: array(ref("JiraIntegrationSettings")) }, ["jira"])),
    "/api/integrations/jira": integrationGet("List Jira integrations", object({ integrations: array(ref("JiraIntegrationSettings")) }, ["integrations"])),
    "/api/integrations/jira/intake": jiraIntakePost("Run Jira intake across enabled integrations"),
    "/api/integrations/jira/test-connection": jiraConnectionPost("Test unsaved Jira credentials"),
    "/api/integrations/jira/{integrationId}": {
      get: integrationOperation("Get Jira integration settings", ref("JiraIntegrationSettings")),
      delete: integrationDelete("Delete a Jira integration")
    },
    "/api/integrations/jira/connection": jiraConnectionPut("Create a Jira connection"),
    "/api/integrations/jira/{integrationId}/connection": jiraConnectionPut("Update a Jira connection"),
    "/api/integrations/jira/{integrationId}/test-connection": jiraSimplePost("Test saved Jira credentials", ref("OkResponse")),
    "/api/integrations/jira/{integrationId}/intake": jiraIntakePost("Run Jira intake for one integration"),
    "/api/integrations/jira/{integrationId}/boards": integrationOperation("List Jira boards", object({ boards: array(ref("JiraBoard")) }, ["boards"])),
    "/api/integrations/jira/{integrationId}/board": integrationPut("Save selected Jira board", ref("SaveJiraBoardRequest")),
    "/api/integrations/jira/{integrationId}/boards/{boardId}/statuses": {
      get: {
        tags: ["Integrations"],
        summary: "List statuses for a Jira board",
        security: bearerSecurity(),
        parameters: [
          pathParam("integrationId", "Jira integration id"),
          { ...pathParam("boardId", "Jira board id"), schema: { type: "integer" } }
        ],
        responses: {
          "200": jsonResponse("Jira board statuses", object({ statuses: array(ref("JiraBoardStatus")) }, ["statuses"])),
          "400": errorResponse(),
          "401": errorResponse(),
          "502": errorResponse()
        }
      }
    },
    "/api/integrations/jira/{integrationId}/ready-status": integrationPut("Save Jira ready status", ref("SaveJiraReadyStatusRequest")),
    "/api/integrations/jira/{integrationId}/workflow": integrationPut("Save complete Jira workflow", ref("SaveJiraWorkflowRequest")),
    "/api/integrations/jira/{integrationId}/enabled": integrationPut("Enable or disable Jira intake", ref("SetEnabledRequest")),
    "/api/integrations/jira/{integrationId}/ready-issues/sample": integrationOperation(
      "Fetch one ready Jira issue sample",
      object({ issue: ref("JiraIssueSummary") })
    ),
    "/api/integrations/jira/{integrationId}/issues/{issueKey}/transitions": jiraTransitionsGet(),
    "/api/integrations/jira/{integrationId}/processed-status": integrationPut("Save Jira processed statuses", ref("SaveJiraProcessedStatusRequest")),
    "/api/integrations/jira/{integrationId}/processed-transition": integrationPut("Save Jira processed transition", ref("SaveJiraProcessedStatusRequest")),
    "/api/integrations/jira/{integrationId}/settings": integrationPut("Save Jira connection and processed settings", ref("SaveJiraSettingsRequest")),
    "/api/integrations/jira/{integrationId}/test": jiraSimplePost("Validate Jira workflow settings", ref("JiraSettingsTestResponse")),
    "/api/integrations/jira/{integrationId}/transitions/{issueKey}": jiraTransitionsGet()
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
      ApiKey: object({
        keyId: { type: "string" },
        userId: { type: "string" },
        apiKey: { type: "string" },
        name: { type: "string" },
        createdAt: { type: "string", format: "date-time" },
        revokedAt: { type: "string", format: "date-time" }
      }, ["keyId", "userId", "apiKey", "createdAt"]),
      CreateApiKeyRequest: object({ name: { type: "string" } }),
      WorkerRegistration: object({
        workerId: { type: "string" },
        userId: { type: "string" },
        apiKeyId: { type: "string" },
        connectionId: { type: "string" },
        paths: array({ type: "string" }),
        skills: array({ type: "string" }),
        enabled: { type: "boolean" },
        enabledTaskTypes: array({ type: "string", enum: ["ai", "shell", "gitflow"] }),
        state: { type: "string", enum: ["started", "running_command", "stopped"] },
        currentTransactionId: { type: "string" },
        activeTransactionIds: array({ type: "string" }),
        maxConcurrentTasks: { type: "integer" },
        activeTaskCount: { type: "integer" },
        registeredAt: { type: "string", format: "date-time" },
        firstRegisteredAt: { type: "string", format: "date-time" },
        lastRegisteredAt: { type: "string", format: "date-time" },
        lastSeenAt: { type: "string", format: "date-time" },
        stateUpdatedAt: { type: "string", format: "date-time" },
        stoppedAt: { type: "string", format: "date-time" }
      }, ["workerId", "userId", "connectionId", "paths", "skills", "enabled", "enabledTaskTypes", "state", "registeredAt", "firstRegisteredAt", "lastRegisteredAt", "lastSeenAt", "stateUpdatedAt"]),
      SetWorkerEnabledRequest: object({ enabled: { type: "boolean" } }, ["enabled"]),
      CreateCommandRequest: object({
        command: { type: "string" },
        commandMode: { type: "string", enum: ["ai", "shell", "gitflow"], default: "ai" }
      }, ["command"]),
      CancelCommandRequest: object({ reason: { type: "string" } }),
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
      CommandResponses: object({ command: ref("Command"), responses: array(freeForm()) }, ["command", "responses"]),
      GitRepository: object({
        repositoryUrl: { type: "string" },
        normalizedRepositoryUrl: { type: "string" },
        defaultSourceBranch: { type: "string" },
        defaultTargetBranch: { type: "string" },
        lastSourceBranch: { type: "string" },
        enabled: { type: "boolean" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
        lastUsedAt: { type: "string", format: "date-time" }
      }, ["repositoryUrl", "normalizedRepositoryUrl", "defaultSourceBranch", "defaultTargetBranch", "enabled", "createdAt", "updatedAt", "lastUsedAt"]),
      GitRepositorySuggestion: object({
        repositoryUrl: { type: "string" },
        normalizedRepositoryUrl: { type: "string" },
        defaultSourceBranch: { type: "string" },
        defaultTargetBranch: { type: "string" },
        lastSourceBranch: { type: "string" },
        lastUsedAt: { type: "string", format: "date-time" },
        previouslyUsedByWorker: { type: "boolean" }
      }, ["repositoryUrl", "normalizedRepositoryUrl", "lastUsedAt", "previouslyUsedByWorker"]),
      SaveGitRepositoryRequest: object({
        repositoryUrl: { type: "string" },
        defaultSourceBranch: { type: "string" },
        defaultTargetBranch: { type: "string" },
        enabled: { type: "boolean" }
      }),
      JiraIntegrationSettings: object({
        id: { type: "string" },
        connected: { type: "boolean" },
        enabled: { type: "boolean" },
        siteUrl: { type: "string" },
        email: { type: "string" },
        boardId: { type: "integer" },
        boardName: { type: "string" },
        boardType: { type: "string" },
        boardFilterId: { type: "integer" },
        readyStatusId: { type: "string" },
        readyStatusName: { type: "string" },
        processingStatusId: { type: "string" },
        processingStatusName: { type: "string" },
        processedStatusId: { type: "string" },
        processedStatusName: { type: "string" },
        updatedAt: { type: "string", format: "date-time" }
      }, ["id", "connected", "enabled", "siteUrl", "email", "boardName", "boardType", "readyStatusId", "readyStatusName", "processingStatusId", "processingStatusName", "processedStatusId", "processedStatusName"]),
      JiraConnectionRequest: object({ siteUrl: { type: "string", format: "uri" }, email: { type: "string", format: "email" }, apiToken: { type: "string" } }, ["siteUrl", "email"]),
      JiraIntakeRequest: object({ integrationId: { type: "string" }, maxIssues: { type: "integer" }, dryRun: { type: "boolean" } }),
      JiraIntakeResult: object({
        processed: { type: "integer" },
        queued: { type: "integer" },
        skipped: { type: "integer" },
        failed: { type: "integer" },
        dryRun: { type: "boolean" },
        items: array(ref("JiraIntakeResultItem"))
      }, ["processed", "queued", "skipped", "failed", "dryRun", "items"]),
      JiraIntakeResultItem: object({
        integrationId: { type: "string" },
        issueKey: { type: "string" },
        issueId: { type: "string" },
        repositoryUrl: { type: "string" },
        normalizedRepositoryUrl: { type: "string" },
        workerId: { type: "string" },
        transactionId: { type: "string" },
        status: { type: "string", enum: ["queued", "skipped", "failed", "dry_run"] },
        reason: { type: "string" }
      }, ["integrationId", "issueKey", "issueId", "status"]),
      JiraBoard: object({ id: { type: "integer" }, name: { type: "string" }, type: { type: "string" }, filterId: { type: "integer" } }, ["id", "name", "type"]),
      JiraBoardStatus: object({ id: { type: "string" }, name: { type: "string" }, statusCategory: { type: "string" } }, ["id", "name", "statusCategory"]),
      JiraIssueSummary: object({
        id: { type: "string" },
        key: { type: "string" },
        summary: { type: "string" },
        status: { type: "string" },
        fields: freeForm()
      }, ["id", "key", "summary", "status"]),
      JiraTransition: object({ id: { type: "string" }, name: { type: "string" }, toStatus: { type: "string" } }, ["id", "name", "toStatus"]),
      SaveJiraBoardRequest: object({ boardId: { type: "integer" }, boardName: { type: "string" }, boardType: { type: "string" }, boardFilterId: { type: "integer" } }, ["boardId", "boardName", "boardType"]),
      SaveJiraReadyStatusRequest: object({ readyStatusId: { type: "string" }, readyStatusName: { type: "string" } }, ["readyStatusId", "readyStatusName"]),
      SaveJiraProcessedStatusRequest: object({
        processingStatusId: { type: "string" },
        processingStatusName: { type: "string" },
        processedStatusId: { type: "string" },
        processedStatusName: { type: "string" },
        enabled: { type: "boolean" }
      }),
      SaveJiraWorkflowRequest: object({
        boardId: { type: "integer" },
        boardName: { type: "string" },
        boardType: { type: "string" },
        boardFilterId: { type: "integer" },
        readyStatusId: { type: "string" },
        readyStatusName: { type: "string" },
        processingStatusId: { type: "string" },
        processingStatusName: { type: "string" },
        processedStatusId: { type: "string" },
        processedStatusName: { type: "string" },
        enabled: { type: "boolean" }
      }, ["boardId", "boardName", "boardType", "readyStatusId", "readyStatusName", "processingStatusId", "processingStatusName", "processedStatusId", "processedStatusName"]),
      SetEnabledRequest: object({ enabled: { type: "boolean" } }, ["enabled"]),
      SaveJiraSettingsRequest: object({
        siteUrl: { type: "string", format: "uri" },
        email: { type: "string", format: "email" },
        apiToken: { type: "string" },
        processingStatusId: { type: "string" },
        processingStatusName: { type: "string" },
        processedStatusId: { type: "string" },
        processedStatusName: { type: "string" },
        enabled: { type: "boolean" }
      }, ["siteUrl", "email"]),
      JiraSettingsTestResponse: object({
        ok: { type: "boolean" },
        matchingIssue: ref("JiraIssueSummary"),
        availableStatuses: array(ref("JiraBoardStatus")),
        processingStatusValidated: { type: "boolean" },
        processedStatusValidated: { type: "boolean" }
      }, ["ok", "availableStatuses", "processingStatusValidated", "processedStatusValidated"])
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

function integrationGet(summary: string, schema: Schema): Schema {
  return {
    get: {
      tags: ["Integrations"],
      summary,
      security: bearerSecurity(),
      responses: {
        "200": jsonResponse(summary, schema),
        "401": errorResponse()
      }
    }
  };
}

function integrationOperation(summary: string, schema: Schema): Schema {
  return {
    tags: ["Integrations"],
    summary,
    security: bearerSecurity(),
    parameters: [pathParam("integrationId", "Jira integration id")],
    responses: {
      "200": jsonResponse(summary, schema),
      "401": errorResponse(),
      "502": errorResponse()
    }
  };
}

function integrationPut(summary: string, requestSchema: Schema): Schema {
  return {
    put: {
      tags: ["Integrations"],
      summary,
      security: bearerSecurity(),
      parameters: [pathParam("integrationId", "Jira integration id")],
      requestBody: jsonBody(requestSchema, true),
      responses: {
        "200": jsonResponse("Saved Jira integration settings", ref("JiraIntegrationSettings")),
        "400": errorResponse(),
        "401": errorResponse(),
        "404": errorResponse()
      }
    }
  };
}

function integrationDelete(summary: string): Schema {
  return {
    tags: ["Integrations"],
    summary,
    security: bearerSecurity(),
    parameters: [pathParam("integrationId", "Jira integration id")],
    responses: {
      "200": jsonResponse("Deleted Jira integration settings", ref("JiraIntegrationSettings")),
      "401": errorResponse(),
      "404": errorResponse()
    }
  };
}

function jiraConnectionPut(summary: string): Schema {
  return {
    put: {
      tags: ["Integrations"],
      summary,
      security: bearerSecurity(),
      parameters: summary.startsWith("Update") ? [pathParam("integrationId", "Jira integration id")] : [],
      requestBody: jsonBody(ref("JiraConnectionRequest"), true),
      responses: {
        "200": jsonResponse("Jira integration settings", ref("JiraIntegrationSettings")),
        "400": errorResponse(),
        "401": errorResponse(),
        "404": errorResponse()
      }
    }
  };
}

function jiraConnectionPost(summary: string): Schema {
  return {
    post: {
      tags: ["Integrations"],
      summary,
      security: bearerSecurity(),
      requestBody: jsonBody(ref("JiraConnectionRequest"), true),
      responses: {
        "200": jsonResponse("Connection test result", ref("OkResponse")),
        "400": errorResponse(),
        "401": errorResponse(),
        "502": errorResponse()
      }
    }
  };
}

function jiraSimplePost(summary: string, responseSchema: Schema): Schema {
  return {
    post: {
      tags: ["Integrations"],
      summary,
      security: bearerSecurity(),
      parameters: [pathParam("integrationId", "Jira integration id")],
      responses: {
        "200": jsonResponse(summary, responseSchema),
        "400": errorResponse(),
        "401": errorResponse(),
        "502": errorResponse()
      }
    }
  };
}

function jiraIntakePost(summary: string): Schema {
  return {
    post: {
      tags: ["Integrations"],
      summary,
      parameters: summary.includes("one") ? [pathParam("integrationId", "Jira integration id")] : [],
      requestBody: jsonBody(ref("JiraIntakeRequest"), false),
      responses: {
        "200": jsonResponse("Dry-run intake result", ref("JiraIntakeResult")),
        "202": jsonResponse("Queued intake result", ref("JiraIntakeResult")),
        "503": errorResponse()
      }
    }
  };
}

function jiraTransitionsGet(): Schema {
  return {
    get: {
      tags: ["Integrations"],
      summary: "List Jira issue transitions",
      security: bearerSecurity(),
      parameters: [
        pathParam("integrationId", "Jira integration id"),
        pathParam("issueKey", "Jira issue key")
      ],
      responses: {
        "200": jsonResponse("Jira transitions", object({ transitions: array(ref("JiraTransition")) }, ["transitions"])),
        "401": errorResponse(),
        "502": errorResponse()
      }
    }
  };
}
