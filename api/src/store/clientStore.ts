import { WorkerRegistration, Command, CommandMode, CommandStatus, PaginatedCommands } from "../types.js";
import { CommandStore, CreateQueuedCommandInput } from "./commands/commandStore.js";
import { WorkerRecord, WorkerRecordStore } from "./workers/workerRecordStore.js";
import { normalizeMaxConcurrentTasks } from "../workers/workerState.js";
import { normalizeEnabledTaskTypes } from "../commandModes.js";

export type RegisterWorkerInput = {
  workerId: string;
  apiKeyId: string;
  connectionId: string;
  paths: string[];
  skills: string[];
  enabledTaskTypes?: CommandMode[];
  maxConcurrentTasks?: number;
};

export type CompleteCommandInput = {
  transactionId: string;
  workerId?: string;
  result: string | null;
  agentResponse?: string | null;
  errorMessage: string | null;
};

export type CommandOutputMetadataInput = {
  transactionId: string;
  workerId?: string;
  outputObjectKey: string;
  outputBytes: number;
  outputStartedAt?: string;
  outputUpdatedAt?: string;
};

export type CancelCommandInput = {
  transactionId: string;
  workerId?: string;
  reason: string;
};

export type CommandPagination = {
  page: number;
  pageSize: number;
};

export type TaskQueueQuery = CommandPagination & {
  statuses: CommandStatus[];
  sortBy?: TaskQueueSortBy;
  sortDirection?: TaskQueueSortDirection;
};

export type TaskQueueSortBy = "status" | "source" | "task" | "worker" | "repository" | "created";

export type TaskQueueSortDirection = "asc" | "desc";

export type WorkerStore = {
  listWorkers(): Promise<WorkerRegistration[]>;
  listWorkersForUser(userId: string): Promise<WorkerRegistration[]>;
  getWorker(workerId: string): Promise<WorkerRegistration | undefined>;
  getWorkerForUser(userId: string, workerId: string): Promise<WorkerRegistration | undefined>;
  registerWorker(input: RegisterWorkerInput): Promise<WorkerRegistration>;
  markWorkerStopped(workerId: string, connectionId: string): Promise<void>;
  setWorkerEnabledForUser(userId: string, workerId: string, enabled: boolean): Promise<WorkerRegistration | undefined>;
  disableWorkersForUser(userId: string): Promise<WorkerRegistration[]>;
  createWorkerCommand(userId: string, workerId: string, command: string, commandMode?: CommandMode, executionCommand?: string): Promise<Command>;
  createQueuedCommand(input: CreateQueuedCommandInput): Promise<Command>;
  getWorkerCommand(transactionId: string): Promise<Command | undefined>;
  listWorkerCommands(workerId: string, pagination: CommandPagination): Promise<PaginatedCommands>;
  listTaskQueueForUser(userId: string, query: TaskQueueQuery): Promise<PaginatedCommands>;
  getQueuedWorkerCommands(workerId: string): Promise<Command[]>;
  getDispatchableQueuedCommands(workerId: string, workerSkills: string[]): Promise<Command[]>;
  getInProgressWorkerCommands(workerId: string): Promise<Command[]>;
  markWorkerCommandInProgress(command: Command, workerId?: string): Promise<Command | undefined>;
  recordWorkerCommandOutputMetadata(input: CommandOutputMetadataInput): Promise<Command>;
  completeWorkerCommand(input: CompleteCommandInput): Promise<Command>;
  cancelWorkerCommand(input: CancelCommandInput): Promise<Command>;
  failStuckWorkerCommands(timeoutMinutes: number): Promise<Command[]>;
};

export function createWorkerStore(
  commands: CommandStore,
  workers: WorkerRecordStore
): WorkerStore {
  return {
    async listWorkers(): Promise<WorkerRegistration[]> {
      const records = await workers.listWorkers();
      const inProgressCommands = await commands.getInProgressWorkerCommandsByWorkerIds(records.map((record) => record.workerId));

      return records.map((record) => mergeWorkerState(record, inProgressCommands.get(record.workerId) ?? []));
    },

    async listWorkersForUser(userId: string): Promise<WorkerRegistration[]> {
      const records = await workers.listWorkersForUser(userId);
      const inProgressCommands = await commands.getInProgressWorkerCommandsByWorkerIds(records.map((record) => record.workerId));

      return records.map((record) => mergeWorkerState(record, inProgressCommands.get(record.workerId) ?? []));
    },

    async getWorker(workerId: string): Promise<WorkerRegistration | undefined> {
      const record = await workers.getWorker(workerId);
      if (!record) return undefined;

      return mergeWorkerState(record, await commands.getInProgressWorkerCommands(workerId));
    },

    async getWorkerForUser(userId: string, workerId: string): Promise<WorkerRegistration | undefined> {
      const record = await workers.getWorkerForUser(userId, workerId);
      if (!record) return undefined;

      return mergeWorkerState(record, await commands.getInProgressWorkerCommands(workerId));
    },

    async registerWorker(input: RegisterWorkerInput): Promise<WorkerRegistration> {
      const record = await workers.upsertWorkerRegistration(input);
      const inProgressCommands = await commands.getInProgressWorkerCommands(input.workerId);
      const state = inProgressCommands.length > 0 ? "running_command" : "started";
      await workers.refreshWorkerActivity(input.workerId, state);

      return mergeWorkerState({ ...record, state }, inProgressCommands);
    },

    async markWorkerStopped(workerId: string, connectionId: string): Promise<void> {
      await workers.markWorkerStopped(workerId, connectionId);
    },

    async setWorkerEnabledForUser(userId: string, workerId: string, enabled: boolean): Promise<WorkerRegistration | undefined> {
      const record = await workers.setWorkerEnabledForUser(userId, workerId, enabled);
      if (!record) return undefined;

      return mergeWorkerState(record, await commands.getInProgressWorkerCommands(workerId));
    },

    async disableWorkersForUser(userId: string): Promise<WorkerRegistration[]> {
      const records = await workers.disableWorkersForUser(userId);
      const inProgressCommands = await commands.getInProgressWorkerCommandsByWorkerIds(records.map((record) => record.workerId));

      return records.map((record) => mergeWorkerState(record, inProgressCommands.get(record.workerId) ?? []));
    },

    async createWorkerCommand(userId: string, workerId: string, command: string, commandMode: CommandMode = "ai", executionCommand?: string): Promise<Command> {
      return commands.createWorkerCommand(userId, workerId, command, commandMode, executionCommand);
    },

    async createQueuedCommand(input: CreateQueuedCommandInput): Promise<Command> {
      return commands.createQueuedCommand(input);
    },

    getWorkerCommand(transactionId: string): Promise<Command | undefined> {
      return commands.getWorkerCommand(transactionId);
    },

    listWorkerCommands(workerId: string, pagination: CommandPagination): Promise<PaginatedCommands> {
      return commands.listWorkerCommands(workerId, pagination);
    },

    listTaskQueueForUser(userId: string, query: TaskQueueQuery): Promise<PaginatedCommands> {
      return commands.listTaskQueueForUser(userId, query);
    },

    async getQueuedWorkerCommands(workerId: string): Promise<Command[]> {
      return commands.getQueuedWorkerCommands(workerId);
    },

    async getDispatchableQueuedCommands(workerId: string, workerSkills: string[]): Promise<Command[]> {
      return commands.getDispatchableQueuedCommands(workerId, workerSkills);
    },

    async getInProgressWorkerCommands(workerId: string): Promise<Command[]> {
      return commands.getInProgressWorkerCommands(workerId);
    },

    async markWorkerCommandInProgress(command: Command, workerId?: string): Promise<Command | undefined> {
      const claimed = await commands.markWorkerCommandInProgress(command, workerId);
      if (!claimed) return undefined;
      if (!claimed.workerId) return undefined;

      await refreshWorkerActivity(commands, workers, claimed.workerId);

      return claimed;
    },

    async recordWorkerCommandOutputMetadata(input: CommandOutputMetadataInput): Promise<Command> {
      return commands.recordWorkerCommandOutputMetadata(input);
    },

    async completeWorkerCommand(input: CompleteCommandInput): Promise<Command> {
      const command = await commands.completeWorkerCommand(input);

      if (command.workerId) {
        await refreshWorkerActivity(commands, workers, command.workerId);
      }

      return command;
    },

    async cancelWorkerCommand(input: CancelCommandInput): Promise<Command> {
      const command = await commands.cancelWorkerCommand(input);

      if (command.workerId) {
        await refreshWorkerActivity(commands, workers, command.workerId);
      }

      return command;
    },

    async failStuckWorkerCommands(timeoutMinutes: number): Promise<Command[]> {
      const failedCommands = await commands.failStuckWorkerCommands(timeoutMinutes);
      if (failedCommands.length === 0) return failedCommands;

      const workerIds = [...new Set(failedCommands.map((command) => command.workerId).filter((workerId): workerId is string => Boolean(workerId)))];
      await Promise.all(workerIds.map((workerId) => refreshWorkerActivity(commands, workers, workerId)));

      return failedCommands;
    }
  };
}

async function refreshWorkerActivity(
  commands: CommandStore,
  workers: WorkerRecordStore,
  workerId: string
): Promise<void> {
  const inProgressCommands = await commands.getInProgressWorkerCommands(workerId);
  await workers.refreshWorkerActivity(workerId, inProgressCommands.length > 0 ? "running_command" : "started");
}

export function mergeWorkerState(record: WorkerRecord, inProgressCommands: Command[] = []): WorkerRegistration {
  const activeTransactionIds = record.state === "stopped"
    ? []
    : inProgressCommands.map((command) => command.transactionId);
  const state = record.state === "stopped"
    ? "stopped"
    : activeTransactionIds.length > 0
      ? "running_command"
      : "started";
  const lastSeenAt = record.lastSeenAt ?? record.lastRegisteredAt;
  const stateUpdatedAt = record.stateUpdatedAt ?? lastSeenAt;

  return {
    workerId: record.workerId,
    apiKeyId: record.apiKeyId,
    connectionId: record.lastConnectionId ?? "",
    paths: record.paths,
    skills: record.skills,
    enabled: record.enabled,
    enabledTaskTypes: normalizeEnabledTaskTypes(record.enabledTaskTypes),
    state,
    activeTransactionIds,
    activeTaskCount: activeTransactionIds.length,
    maxConcurrentTasks: normalizeMaxConcurrentTasks(record.maxConcurrentTasks),
    ...(activeTransactionIds[0] ? { currentTransactionId: activeTransactionIds[0] } : {}),
    registeredAt: record.firstRegisteredAt,
    firstRegisteredAt: record.firstRegisteredAt,
    lastRegisteredAt: record.lastRegisteredAt,
    lastSeenAt,
    stateUpdatedAt,
    ...(state === "stopped" ? { stoppedAt: record.stoppedAt ?? stateUpdatedAt } : {})
  };
}
