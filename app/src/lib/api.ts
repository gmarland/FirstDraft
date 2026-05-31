import type {
  WorkerRegistration,
  Command,
  CommandMode,
  CommandStatus,
  TaskQueueSortBy,
  TaskQueueSortDirection,
  PaginatedCommands,
  CreatedApiKey,
  LoginResponse,
  ApiKey,
  GitflowSuggestions,
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

  deleteMe(token: string) {
    return request<void>("/api/auth/me", {
      token,
      method: "DELETE",
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

  listTaskQueue(token: string, pagination: {
    page: number;
    pageSize: number;
    statuses: CommandStatus[];
    sortBy?: TaskQueueSortBy;
    sortDirection?: TaskQueueSortDirection;
  }) {
    const params = new URLSearchParams({
      page: String(pagination.page),
      pageSize: String(pagination.pageSize),
    });
    for (const status of pagination.statuses) {
      params.append("status", status);
    }
    if (pagination.sortBy && pagination.sortDirection) {
      params.set("sortBy", pagination.sortBy);
      params.set("sortDirection", pagination.sortDirection);
    }

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

};
