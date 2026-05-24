import { WorkerRegistration, Command, CommandMode } from "../types.js";
import { CommandStore } from "./commands/commandStore.js";
import { WorkerRecord, WorkerRecordStore } from "./workers/workerRecordStore.js";
import { normalizeMaxConcurrentTasks } from "../workers/workerState.js";

export type RegisterWorkerInput = {
  workerId: string;
  apiKeyId: string;
  connectionId: string;
  paths: string[];
  skills: string[];
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

export type WorkerStore = {
  listWorkers(): Promise<WorkerRegistration[]>;
  listWorkersForUser(userId: string): Promise<WorkerRegistration[]>;
  getWorker(workerId: string): Promise<WorkerRegistration | undefined>;
  getWorkerForUser(userId: string, workerId: string): Promise<WorkerRegistration | undefined>;
  registerWorker(input: RegisterWorkerInput): Promise<WorkerRegistration>;
  markWorkerStopped(workerId: string, connectionId: string): Promise<void>;
  createWorkerCommand(userId: string, workerId: string, command: string, commandMode?: CommandMode, executionCommand?: string): Promise<Command>;
  getWorkerCommand(transactionId: string): Promise<Command | undefined>;
  listWorkerCommands(workerId: string): Promise<Command[]>;
  getQueuedWorkerCommands(workerId: string): Promise<Command[]>;
  getInProgressWorkerCommands(workerId: string): Promise<Command[]>;
  markWorkerCommandInProgress(command: Command): Promise<Command | undefined>;
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

    async createWorkerCommand(userId: string, workerId: string, command: string, commandMode: CommandMode = "ai", executionCommand?: string): Promise<Command> {
      return commands.createWorkerCommand(userId, workerId, command, commandMode, executionCommand);
    },

    getWorkerCommand(transactionId: string): Promise<Command | undefined> {
      return commands.getWorkerCommand(transactionId);
    },

    listWorkerCommands(workerId: string): Promise<Command[]> {
      return commands.listWorkerCommands(workerId);
    },

    async getQueuedWorkerCommands(workerId: string): Promise<Command[]> {
      return commands.getQueuedWorkerCommands(workerId);
    },

    async getInProgressWorkerCommands(workerId: string): Promise<Command[]> {
      return commands.getInProgressWorkerCommands(workerId);
    },

    async markWorkerCommandInProgress(command: Command): Promise<Command | undefined> {
      const claimed = await commands.markWorkerCommandInProgress(command);
      if (!claimed) return undefined;

      await refreshWorkerActivity(commands, workers, command.workerId);

      return claimed;
    },

    async recordWorkerCommandOutputMetadata(input: CommandOutputMetadataInput): Promise<Command> {
      return commands.recordWorkerCommandOutputMetadata(input);
    },

    async completeWorkerCommand(input: CompleteCommandInput): Promise<Command> {
      const command = await commands.completeWorkerCommand(input);

      await refreshWorkerActivity(commands, workers, command.workerId);

      return command;
    },

    async cancelWorkerCommand(input: CancelCommandInput): Promise<Command> {
      const command = await commands.cancelWorkerCommand(input);

      await refreshWorkerActivity(commands, workers, command.workerId);

      return command;
    },

    async failStuckWorkerCommands(timeoutMinutes: number): Promise<Command[]> {
      const failedCommands = await commands.failStuckWorkerCommands(timeoutMinutes);
      if (failedCommands.length === 0) return failedCommands;

      const workerIds = [...new Set(failedCommands.map((command) => command.workerId))];
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
