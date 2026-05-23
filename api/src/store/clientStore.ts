import { WorkerRegistration, Command, CommandMode } from "../types.js";
import { CommandStore } from "./commands/commandStore.js";
import { WorkerRecord, WorkerRecordStore } from "./workers/workerRecordStore.js";
import { getActiveTransactionIds, normalizeMaxConcurrentTasks } from "../workers/workerState.js";

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

type RedisStoreClient = {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options?: { NX?: boolean; EX?: number }
  ): Promise<unknown>;
  del(key: string): Promise<unknown>;
  sAdd(key: string, member: string): Promise<unknown>;
  sMembers(key: string): Promise<string[]>;
};

export function createWorkerStore(
  redis: RedisStoreClient,
  commands: CommandStore,
  workers: WorkerRecordStore
): WorkerStore {
  return {
    async listWorkers(): Promise<WorkerRegistration[]> {
      const records = await workers.listWorkers();
      const clients = await Promise.all(records.map(async (record) => mergeWorkerState(record, await getRuntimeWorker(redis, record.workerId))));

      return clients;
    },

    async listWorkersForUser(userId: string): Promise<WorkerRegistration[]> {
      const records = await workers.listWorkersForUser(userId);
      const clients = await Promise.all(records.map(async (record) => mergeWorkerState(record, await getRuntimeWorker(redis, record.workerId))));

      return clients;
    },

    async getWorker(workerId: string): Promise<WorkerRegistration | undefined> {
      const [record, runtime] = await Promise.all([
        workers.getWorker(workerId),
        getRuntimeWorker(redis, workerId)
      ]);

      if (record) return mergeWorkerState(record, runtime);
      return runtime;
    },

    async getWorkerForUser(userId: string, workerId: string): Promise<WorkerRegistration | undefined> {
      const record = await workers.getWorkerForUser(userId, workerId);
      if (!record) return undefined;

      return mergeWorkerState(record, await getRuntimeWorker(redis, workerId));
    },

    async registerWorker(input: RegisterWorkerInput): Promise<WorkerRegistration> {
      const lockKey = workerRegistrationLockKey(input.workerId);
      const lockValue = `${input.connectionId}:${Date.now()}:${Math.random()}`;
      const lockAcquired = await redis.set(lockKey, lockValue, { NX: true, EX: 10 });
      if (!lockAcquired) {
        throw new Error("worker id is already registering");
      }

      const now = new Date().toISOString();
      try {
        const existing = await getRuntimeWorker(redis, input.workerId);
        if (existing && existing.connectionId !== input.connectionId && existing.state !== "stopped") {
          throw new Error("worker id is already registered");
        }

        const record = await workers.upsertWorkerRegistration(input);
        const existingActiveTransactionIds = getActiveTransactionIds(existing);
        const inProgressCommands = existingActiveTransactionIds.length > 0
          ? (await Promise.all(existingActiveTransactionIds.map((transactionId) => commands.getWorkerCommand(transactionId))))
            .filter((command): command is Command => command?.status === "in_progress")
          : await commands.getInProgressWorkerCommands(input.workerId);
        const activeTransactionIds = inProgressCommands.map((command) => command.transactionId);
        const client: WorkerRegistration = {
          workerId: input.workerId,
          apiKeyId: record.apiKeyId,
          connectionId: input.connectionId,
          paths: input.paths,
          skills: input.skills,
          state: activeTransactionIds.length > 0 ? "running_command" : "started",
          activeTransactionIds,
          activeTaskCount: activeTransactionIds.length,
          maxConcurrentTasks: normalizeMaxConcurrentTasks(input.maxConcurrentTasks),
          ...(activeTransactionIds[0] ? { currentTransactionId: activeTransactionIds[0] } : {}),
          registeredAt: record.firstRegisteredAt,
          firstRegisteredAt: record.firstRegisteredAt,
          lastRegisteredAt: record.lastRegisteredAt,
          lastSeenAt: now,
          stateUpdatedAt: now
        };

        await redis.sAdd(workersKey(), input.workerId);
        await setJson(redis, workerKey(input.workerId), client);

        return client;
      } finally {
        if ((await redis.get(lockKey)) === lockValue) {
          await redis.del(lockKey);
        }
      }
    },

    async markWorkerStopped(workerId: string, connectionId: string): Promise<void> {
      const client = await getRuntimeWorker(redis, workerId);
      if (!client) return;
      if (client.connectionId !== connectionId) return;

      const now = new Date().toISOString();
      client.state = "stopped";
      client.stoppedAt = now;
      client.stateUpdatedAt = now;
      await setJson(redis, workerKey(workerId), client);
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
      const now = new Date().toISOString();

      const claimed = await commands.markWorkerCommandInProgress(command);
      if (!claimed) return undefined;

      await refreshRuntimeWorkerActivity(redis, commands, command.workerId, now);

      return claimed;
    },

    async recordWorkerCommandOutputMetadata(input: CommandOutputMetadataInput): Promise<Command> {
      return commands.recordWorkerCommandOutputMetadata(input);
    },

    async completeWorkerCommand(input: CompleteCommandInput): Promise<Command> {
      const now = new Date().toISOString();
      const command = await commands.completeWorkerCommand(input);

      await refreshRuntimeWorkerActivity(redis, commands, command.workerId, now);

      return command;
    },

    async cancelWorkerCommand(input: CancelCommandInput): Promise<Command> {
      const now = new Date().toISOString();
      const command = await commands.cancelWorkerCommand(input);

      await refreshRuntimeWorkerActivity(redis, commands, command.workerId, now);

      return command;
    },

    async failStuckWorkerCommands(timeoutMinutes: number): Promise<Command[]> {
      const failedCommands = await commands.failStuckWorkerCommands(timeoutMinutes);
      if (failedCommands.length === 0) return failedCommands;

      const failedTransactionIds = new Set(failedCommands.map((command) => command.transactionId));
      const now = new Date().toISOString();
      const workerIds = await redis.sMembers(workersKey());

      await Promise.all(workerIds.map(async (workerId) => {
        const client = await getRuntimeWorker(redis, workerId);
        if (!client) return;
        const activeTransactionIds = getActiveTransactionIds(client);
        if (!activeTransactionIds.some((transactionId) => failedTransactionIds.has(transactionId))) return;

        await refreshRuntimeWorkerActivity(redis, commands, workerId, now);
      }));

      return failedCommands;
    }
  };
}

async function getRuntimeWorker(
  redis: RedisStoreClient,
  workerId: string
): Promise<WorkerRegistration | undefined> {
  return getJson<WorkerRegistration>(redis, workerKey(workerId));
}

async function getJson<T>(redis: RedisStoreClient, key: string): Promise<T | undefined> {
  const value = await redis.get(key);
  return value ? (JSON.parse(value) as T) : undefined;
}

function setJson(redis: RedisStoreClient, key: string, value: unknown): Promise<unknown> {
  return redis.set(key, JSON.stringify(value));
}

function workersKey(): string {
  return "firstdraft:workers";
}

function workerKey(workerId: string): string {
  return `firstdraft:worker:${workerId}`;
}

function workerRegistrationLockKey(workerId: string): string {
  return `firstdraft:worker:${workerId}:registration-lock`;
}

async function refreshRuntimeWorkerActivity(
  redis: RedisStoreClient,
  commands: CommandStore,
  workerId: string,
  now: string
): Promise<void> {
  const client = await getRuntimeWorker(redis, workerId);
  if (!client) return;

  const inProgressCommands = await commands.getInProgressWorkerCommands(workerId);
  const activeTransactionIds = inProgressCommands.map((command) => command.transactionId);
  client.activeTransactionIds = activeTransactionIds;
  client.activeTaskCount = activeTransactionIds.length;
  client.currentTransactionId = activeTransactionIds[0];
  if (!client.currentTransactionId) delete client.currentTransactionId;
  delete client.stoppedAt;
  client.state = activeTransactionIds.length > 0 ? "running_command" : "started";
  client.lastSeenAt = now;
  client.stateUpdatedAt = now;
  await setJson(redis, workerKey(workerId), client);
}

function mergeWorkerState(record: WorkerRecord, runtime?: WorkerRegistration): WorkerRegistration {
  if (runtime) {
    return {
      ...runtime,
      apiKeyId: record.apiKeyId,
      registeredAt: record.firstRegisteredAt,
      firstRegisteredAt: record.firstRegisteredAt,
      lastRegisteredAt: record.lastRegisteredAt,
      paths: runtime.paths.length > 0 ? runtime.paths : record.paths,
      skills: (runtime.skills ?? []).length > 0 ? runtime.skills : record.skills,
      activeTransactionIds: getActiveTransactionIds(runtime),
      activeTaskCount: getActiveTransactionIds(runtime).length,
      maxConcurrentTasks: normalizeMaxConcurrentTasks(runtime.maxConcurrentTasks ?? record.maxConcurrentTasks)
    };
  }

  const lastSeenAt = record.lastSeenAt ?? record.lastRegisteredAt;
  return {
    workerId: record.workerId,
    apiKeyId: record.apiKeyId,
    connectionId: record.lastConnectionId ?? "",
    paths: record.paths,
    skills: record.skills,
    state: "stopped",
    activeTransactionIds: [],
    activeTaskCount: 0,
    maxConcurrentTasks: normalizeMaxConcurrentTasks(record.maxConcurrentTasks),
    registeredAt: record.firstRegisteredAt,
    firstRegisteredAt: record.firstRegisteredAt,
    lastRegisteredAt: record.lastRegisteredAt,
    lastSeenAt,
    stateUpdatedAt: lastSeenAt,
    stoppedAt: lastSeenAt
  };
}
