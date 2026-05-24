import type {
  WorkerRegistration,
  Command,
  CommandMode,
  PaginatedCommands,
  CreatedApiKey,
  LoginResponse,
  ApiKey,
  GitflowSuggestions,
  GitRepository,
  JiraBoard,
  JiraBoardStatus,
  JiraConnectionInput,
  JiraIssueSummary,
  JiraIntegrationSettings,
  JiraIntegrationTestResult,
  JiraTransition,
  SaveJiraIntegrationInput,
  SaveGitRepositoryInput,
  UpdateProfileInput,
} from "../types/api";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5080";

export class ApiError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

type RequestOptions = {
  token?: string;
  adminKey?: string;
  method?: string;
  body?: unknown;
};

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers = new Headers();

  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  if (options.token) {
    headers.set("authorization", `Bearer ${options.token}`);
  }

  if (options.adminKey) {
    headers.set("x-admin-key", options.adminKey);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function readText(path: string, token: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new ApiError(message, response.status);
  }

  return response.text();
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

export const api = {
  baseUrl: API_BASE_URL,

  login(input: { email: string; password: string }) {
    return request<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: input,
    });
  },

  me(token: string) {
    return request<{ user: LoginResponse["user"] }>("/api/auth/me", { token });
  },

  updateMe(token: string, input: UpdateProfileInput) {
    return request<{ user: LoginResponse["user"] }>("/api/auth/me", {
      token,
      method: "PATCH",
      body: input,
    });
  },

  signup(input: {
    email: string;
    password: string;
    name?: string;
  }) {
    return request<LoginResponse>("/api/auth/signup", {
      method: "POST",
      body: input,
    });
  },

  listWorkers(token: string) {
    return request<WorkerRegistration[]>("/api/workers", { token });
  },

  getWorkerState(token: string, workerId: string) {
    return request<WorkerRegistration>(
      `/api/workers/${encodeURIComponent(workerId)}/state`,
      { token },
    );
  },

  updateWorker(token: string, workerId: string, input: { enabled: boolean }) {
    return request<WorkerRegistration>(
      `/api/workers/${encodeURIComponent(workerId)}`,
      {
        token,
        method: "PATCH",
        body: input,
      },
    );
  },

  disableAllWorkers(token: string) {
    return request<WorkerRegistration[]>("/api/workers/disable-all", {
      token,
      method: "POST",
    });
  },

  listCommands(token: string, workerId: string, pagination: { page: number; pageSize: number }) {
    const params = new URLSearchParams({
      page: String(pagination.page),
      pageSize: String(pagination.pageSize),
    });

    return request<PaginatedCommands>(
      `/api/workers/${encodeURIComponent(workerId)}/commands?${params.toString()}`,
      { token },
    );
  },

  listTaskQueue(token: string, pagination: { page: number; pageSize: number }) {
    const params = new URLSearchParams({
      page: String(pagination.page),
      pageSize: String(pagination.pageSize),
    });

    return request<PaginatedCommands>(
      `/api/workers/task-queue?${params.toString()}`,
      { token },
    );
  },

  getGitflowSuggestions(token: string, workerId: string) {
    return request<GitflowSuggestions>(
      `/api/workers/${encodeURIComponent(workerId)}/gitflow-suggestions`,
      { token },
    );
  },

  listRepositories(token: string) {
    return request<{ repositories: GitRepository[] }>("/api/repositories", { token });
  },

  createRepository(token: string, input: SaveGitRepositoryInput) {
    return request<GitRepository>("/api/repositories", {
      token,
      method: "POST",
      body: input,
    });
  },

  updateRepository(token: string, normalizedRepositoryUrl: string, input: SaveGitRepositoryInput) {
    return request<GitRepository>(
      `/api/repositories/${encodeURIComponent(normalizedRepositoryUrl)}`,
      {
        token,
        method: "PUT",
        body: input,
      },
    );
  },

  deleteRepository(token: string, normalizedRepositoryUrl: string) {
    return request<void>(
      `/api/repositories/${encodeURIComponent(normalizedRepositoryUrl)}`,
      {
        token,
        method: "DELETE",
      },
    );
  },

  createCommand(token: string, workerId: string, command: string, commandMode: CommandMode) {
    return request<Command>(
      `/api/workers/${encodeURIComponent(workerId)}/commands`,
      {
        token,
        method: "POST",
        body: { command, commandMode },
      },
    );
  },

  getCommand(token: string, workerId: string, transactionId: string) {
    return request<Command>(
      `/api/workers/${encodeURIComponent(workerId)}/commands/${encodeURIComponent(transactionId)}`,
      { token },
    );
  },

  cancelCommand(token: string, workerId: string, transactionId: string) {
    return request<Command>(
      `/api/workers/${encodeURIComponent(workerId)}/commands/${encodeURIComponent(transactionId)}/cancel`,
      {
        token,
        method: "POST",
        body: { reason: "command cancelled from UI" },
      },
    );
  },

  getCommandResponses(token: string, workerId: string, transactionId: string) {
    return request<unknown>(
      `/api/workers/${encodeURIComponent(workerId)}/commands/${encodeURIComponent(transactionId)}/responses`,
      { token },
    );
  },

  getCommandOutput(token: string, workerId: string, transactionId: string) {
    return readText(
      `/api/workers/${encodeURIComponent(workerId)}/commands/${encodeURIComponent(transactionId)}/output`,
      token,
    );
  },

  listApiKeys(token: string) {
    return request<ApiKey[]>("/api/me/api-keys", { token });
  },

  createApiKey(token: string, input: { name?: string }) {
    return request<CreatedApiKey>("/api/me/api-keys", {
      token,
      method: "POST",
      body: input,
    });
  },

  revokeApiKey(token: string, keyId: string) {
    return request<ApiKey>(
      `/api/me/api-keys/${encodeURIComponent(keyId)}`,
      {
        token,
        method: "DELETE",
      },
    );
  },

  listJiraIntegrations(token: string) {
    return request<{ integrations: JiraIntegrationSettings[] }>("/api/integrations/jira", { token });
  },

  getJiraIntegration(token: string, integrationId: string) {
    return request<JiraIntegrationSettings>(
      `/api/integrations/jira/${encodeURIComponent(integrationId)}`,
      { token },
    );
  },

  saveJiraIntegration(token: string, integrationId: string, input: SaveJiraIntegrationInput) {
    return request<JiraIntegrationSettings>(`/api/integrations/jira/${encodeURIComponent(integrationId)}/settings`, {
      token,
      method: "PUT",
      body: input,
    });
  },

  saveJiraConnection(token: string, input: JiraConnectionInput, integrationId?: string) {
    return request<JiraIntegrationSettings>(integrationId
      ? `/api/integrations/jira/${encodeURIComponent(integrationId)}/connection`
      : "/api/integrations/jira/connection", {
      token,
      method: "PUT",
      body: input,
    });
  },

  testJiraConnection(token: string, integrationId: string) {
    return request<{ ok: boolean }>(`/api/integrations/jira/${encodeURIComponent(integrationId)}/test-connection`, {
      token,
      method: "POST",
      body: {},
    });
  },

  testUnsavedJiraConnection(token: string, input: Required<JiraConnectionInput>) {
    return request<{ ok: boolean }>("/api/integrations/jira/test-connection", {
      token,
      method: "POST",
      body: input,
    });
  },

  listJiraBoards(token: string, integrationId: string) {
    return request<{ boards: JiraBoard[] }>(`/api/integrations/jira/${encodeURIComponent(integrationId)}/boards`, { token });
  },

  saveJiraBoard(token: string, integrationId: string, input: {
    boardId: number;
    boardName: string;
    boardType: string;
    boardFilterId?: number;
  }) {
    return request<JiraIntegrationSettings>(`/api/integrations/jira/${encodeURIComponent(integrationId)}/board`, {
      token,
      method: "PUT",
      body: input,
    });
  },

  listJiraBoardStatuses(token: string, integrationId: string, boardId: number) {
    return request<{ statuses: JiraBoardStatus[] }>(
      `/api/integrations/jira/${encodeURIComponent(integrationId)}/boards/${encodeURIComponent(String(boardId))}/statuses`,
      { token },
    );
  },

  saveJiraReadyStatus(token: string, integrationId: string, input: {
    readyStatusId: string;
    readyStatusName: string;
  }) {
    return request<JiraIntegrationSettings>(`/api/integrations/jira/${encodeURIComponent(integrationId)}/ready-status`, {
      token,
      method: "PUT",
      body: input,
    });
  },

  saveJiraWorkflow(token: string, integrationId: string, input: {
    boardId: number;
    boardName: string;
    boardType: string;
    boardFilterId?: number;
    readyStatusId: string;
    readyStatusName: string;
    processingStatusId: string;
    processingStatusName: string;
    processedStatusId: string;
    processedStatusName: string;
    enabled: boolean;
  }) {
    return request<JiraIntegrationSettings>(`/api/integrations/jira/${encodeURIComponent(integrationId)}/workflow`, {
      token,
      method: "PUT",
      body: input,
    });
  },

  setJiraIntegrationEnabled(token: string, integrationId: string, enabled: boolean) {
    return request<JiraIntegrationSettings>(`/api/integrations/jira/${encodeURIComponent(integrationId)}/enabled`, {
      token,
      method: "PUT",
      body: { enabled },
    });
  },

  getSampleReadyJiraIssue(token: string, integrationId: string) {
    return request<{ issue?: JiraIssueSummary }>(`/api/integrations/jira/${encodeURIComponent(integrationId)}/ready-issues/sample`, { token });
  },

  listJiraIssueTransitions(token: string, integrationId: string, issueKey: string) {
    return request<{ transitions: JiraTransition[] }>(
      `/api/integrations/jira/${encodeURIComponent(integrationId)}/issues/${encodeURIComponent(issueKey)}/transitions`,
      { token },
    );
  },

  saveJiraProcessedStatus(token: string, integrationId: string, input: {
    processedStatusId?: string;
    processedStatusName?: string;
    enabled: boolean;
  }) {
    return request<JiraIntegrationSettings>(`/api/integrations/jira/${encodeURIComponent(integrationId)}/processed-status`, {
      token,
      method: "PUT",
      body: input,
    });
  },

  deleteJiraIntegration(token: string, integrationId: string) {
    return request<JiraIntegrationSettings>(`/api/integrations/jira/${encodeURIComponent(integrationId)}`, {
      token,
      method: "DELETE",
    });
  },

  testJiraIntegration(token: string, integrationId: string) {
    return request<JiraIntegrationTestResult>(`/api/integrations/jira/${encodeURIComponent(integrationId)}/test`, {
      token,
      method: "POST",
      body: {},
    });
  },
};
