export type ClientState = "started" | "running_command" | "stopped";

export type CommandStatus = "queued" | "in_progress" | "completed" | "failed";

export type CommandMode = "ai" | "shell" | "gitflow";

export type TaskQueueSortBy = "status" | "source" | "task" | "worker" | "repository" | "created";

export type TaskQueueSortDirection = "asc" | "desc";

export type WorkerRegistration = {
  workerId: string;
  userId: string;
  apiKeyId?: string;
  connectionId: string;
  paths: string[];
  skills: string[];
  enabled: boolean;
  enabledTaskTypes: CommandMode[];
  state: ClientState;
  currentTransactionId?: string;
  activeTransactionIds?: string[];
  maxConcurrentTasks?: number;
  activeTaskCount?: number;
  registeredAt: string;
  firstRegisteredAt: string;
  lastRegisteredAt: string;
  lastSeenAt: string;
  stateUpdatedAt: string;
  stoppedAt?: string;
};

export type Command = {
  transactionId: string;
  userId: string;
  workerId?: string;
  workerOwnerUserId?: string;
  workerOwnerName?: string;
  workerOwnerEmail?: string;
  command: string;
  taskSummary?: string;
  executionCommand?: string | null;
  commandMode: CommandMode;
  repositoryUrl?: string;
  normalizedRepositoryUrl?: string;
  sourceProvider?: string;
  sourceItemId?: string;
  sourceItemKey?: string;
  sourceItemUrl?: string;
  status: CommandStatus;
  createdAt: string;
  claimedAt?: string;
  completedAt?: string;
  result?: string | null;
  agentResponse?: string | null;
  errorMessage?: string | null;
  outputObjectKey?: string;
  outputBytes?: number;
  outputStartedAt?: string;
  outputUpdatedAt?: string;
};

export type PaginatedCommands = {
  commands: Command[];
  total: number;
  page: number;
  pageSize: number;
};

export type GitRepositorySuggestion = {
  repositoryUrl: string;
  normalizedRepositoryUrl: string;
  sourceBranch: string;
  targetBranch: string;
  lastUsedAt: string;
};

export type GitflowSuggestions = {
  repositories: GitRepositorySuggestion[];
};

export type UserRole = "admin" | "user";

export type User = {
  userId: string;
  email: string;
  name?: string;
  role: UserRole;
  createdAt: string;
  disabledAt?: string;
};

export type UpdateProfileInput = {
  email?: string;
  name?: string;
  password?: string;
};

export type ApiKey = {
  keyId: string;
  userId: string;
  apiKey: string;
  name?: string;
  createdAt: string;
  revokedAt?: string;
};

export type CreatedApiKey = ApiKey & {
  apiSecret: string;
};

export type LoginResponse = {
  token: string;
  tokenType: "Bearer";
  expiresIn: string | number;
  user: User;
};
