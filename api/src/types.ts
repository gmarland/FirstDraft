export type WorkerRegistration = {
  workerId: string;
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

export type ClientState = "started" | "running_command" | "stopped";

export type CommandStatus = "queued" | "in_progress" | "completed" | "failed";

export type CommandMode = "ai" | "shell" | "gitflow";

export type Command = {
  transactionId: string;
  userId: string;
  workerId?: string;
  command: string;
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

export type ApiKey = {
  keyId: string;
  userId: string;
  apiKey: string;
  name?: string;
  createdAt: string;
  revokedAt?: string;
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
