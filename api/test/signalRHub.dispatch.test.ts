import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { ApiToWorkerTokenIssuer, WorkerTokenService } from "../src/auth/workerTokens.js";
import { CommandOutputStorage } from "../src/storage/commandOutputStorage.js";
import { CommandResultService } from "../src/signalr/commands/commandResultService.js";
import { WorkerCommandDispatcher } from "../src/signalr/commands/workerCommandDispatcher.js";
import { SignalRInvocationDispatcher } from "../src/signalr/invocations/signalRInvocationDispatcher.js";
import { SignalRHub } from "../src/signalr/signalRHub.js";
import { SignalRConnection } from "../src/signalr/shared/types.js";
import { WorkerRegistrationService } from "../src/signalr/workers/workerRegistrationService.js";
import type { WorkerStore } from "../src/store/clientStore.js";
import type { Command, CommandMode, WorkerRegistration } from "../src/types.js";

type SentInvocation = {
  target: string;
  arguments: unknown[];
};

class FakeWorkerStore implements WorkerStore {
  public worker: WorkerRegistration;
  public workers: WorkerRegistration[];
  public commands: Command[];
  public registeredInput?: unknown;
  public stoppedWorkers: Array<{ workerId: string; connectionId: string }> = [];
  public outputMetadataInput?: unknown;
  public localRepositoriesByWorker = new Map<string, Set<string>>();

  public constructor(maxConcurrentTasks: number, commandModes: CommandMode[], enabledTaskTypes: CommandMode[] = ["ai", "shell", "gitflow"]) {
    const now = new Date().toISOString();
    this.worker = {
      workerId: "worker-1",
      apiKeyId: "api-key-1",
      connectionId: "connection-1",
      paths: [],
      skills: ["git", "npm"],
      enabled: true,
      enabledTaskTypes,
      state: "started",
      activeTransactionIds: [],
      activeTaskCount: 0,
      maxConcurrentTasks,
      registeredAt: now,
      firstRegisteredAt: now,
      lastRegisteredAt: now,
      lastSeenAt: now,
      stateUpdatedAt: now
    };
    this.workers = [this.worker];
    this.commands = commandModes.map((commandMode, index) => ({
      transactionId: `command-${index + 1}`,
      userId: "user-1",
      workerId: this.worker.workerId,
      command: `${commandMode}-${index + 1}`,
      commandMode,
      status: "queued",
      createdAt: new Date(Date.now() + index).toISOString()
    }));
  }

  public async listWorkers(): Promise<WorkerRegistration[]> {
    return this.workers.map((worker) => ({ ...worker }));
  }

  public async listWorkersForUser(): Promise<WorkerRegistration[]> {
    return this.listWorkers();
  }

  public async getWorker(workerId: string): Promise<WorkerRegistration | undefined> {
    const worker = this.workers.find((candidate) => candidate.workerId === workerId);
    return worker ? { ...worker } : undefined;
  }

  public async getWorkerForUser(_userId: string, workerId: string): Promise<WorkerRegistration | undefined> {
    return this.getWorker(workerId);
  }

  public async registerWorker(input?: unknown): Promise<WorkerRegistration> {
    this.registeredInput = input;
    return this.worker;
  }

  public async markWorkerStopped(workerId: string, connectionId: string): Promise<void> {
    this.stoppedWorkers.push({ workerId, connectionId });
  }

  public async setWorkerEnabledForUser(_userId: string, workerId: string, enabled: boolean): Promise<WorkerRegistration | undefined> {
    const worker = this.workers.find((candidate) => candidate.workerId === workerId);
    if (!worker) return undefined;
    worker.enabled = enabled;
    return { ...worker };
  }

  public async createWorkerCommand(userId: string, workerId: string, command: string, commandMode: CommandMode = "ai"): Promise<Command> {
    const queued = await this.createQueuedCommand({ userId, workerId, command, commandMode });
    return queued;
  }

  public async createQueuedCommand(input: {
    userId: string;
    workerId?: string;
    command: string;
    commandMode?: CommandMode;
    repositoryUrl?: string;
    normalizedRepositoryUrl?: string;
  }): Promise<Command> {
    const command: Command = {
      transactionId: `command-${this.commands.length + 1}`,
      userId: input.userId,
      workerId: input.workerId,
      command: input.command,
      commandMode: input.commandMode ?? "ai",
      repositoryUrl: input.repositoryUrl,
      normalizedRepositoryUrl: input.normalizedRepositoryUrl,
      status: "queued",
      createdAt: new Date(Date.now() + this.commands.length).toISOString()
    };
    this.commands.push(command);
    return command;
  }

  public async getWorkerCommand(transactionId: string): Promise<Command | undefined> {
    return this.commands.find((command) => command.transactionId === transactionId);
  }

  public async listWorkerCommands(): Promise<Command[]> {
    return [...this.commands];
  }

  public async getQueuedWorkerCommands(workerId: string): Promise<Command[]> {
    return this.commands.filter((command) => command.workerId === workerId && command.status === "queued");
  }

  public async getDispatchableQueuedCommands(workerId: string, workerSkills: string[]): Promise<Command[]> {
    const supportsGitflow = workerSkills.map((skill) => skill.toLowerCase()).includes("git");
    const localRepositories = this.localRepositoriesByWorker.get(workerId) ?? new Set<string>();
    return this.commands
      .filter((command) => {
        if (command.status !== "queued") return false;
        if (command.workerId && command.workerId !== workerId) return false;
        if (command.commandMode === "gitflow" && !supportsGitflow) return false;
        return command.commandMode === "ai" || command.commandMode === "shell" || command.commandMode === "gitflow";
      })
      .sort((left, right) => {
        const assignedDelta = Number(left.workerId !== workerId) - Number(right.workerId !== workerId);
        if (assignedDelta !== 0) return assignedDelta;
        const leftLocal = left.normalizedRepositoryUrl ? localRepositories.has(left.normalizedRepositoryUrl) : false;
        const rightLocal = right.normalizedRepositoryUrl ? localRepositories.has(right.normalizedRepositoryUrl) : false;
        if (leftLocal !== rightLocal) return leftLocal ? -1 : 1;
        return Date.parse(left.createdAt) - Date.parse(right.createdAt);
      });
  }

  public async getInProgressWorkerCommands(): Promise<Command[]> {
    return this.commands.filter((command) => command.status === "in_progress");
  }

  public async markWorkerCommandInProgress(command: Command, workerId?: string): Promise<Command | undefined> {
    const stored = await this.getWorkerCommand(command.transactionId);
    if (!stored || stored.status !== "queued") return undefined;
    if (stored.workerId && workerId && stored.workerId !== workerId) return undefined;
    if (!stored.workerId) stored.workerId = workerId;
    if (!stored.workerId) return undefined;

    stored.status = "in_progress";
    stored.claimedAt = new Date().toISOString();
    this.refreshActiveState(stored.workerId);
    return stored;
  }

  public async recordWorkerCommandOutputMetadata(input: unknown): Promise<Command> {
    this.outputMetadataInput = input;
    const transactionId = (input as { transactionId: string }).transactionId;
    const stored = await this.getWorkerCommand(transactionId);
    if (!stored) throw new Error("command not found");
    Object.assign(stored, input);
    return stored;
  }

  public async completeWorkerCommand(input: {
    transactionId: string;
    result?: string | null;
    agentResponse?: string | null;
    errorMessage?: string | null;
  }): Promise<Command> {
    const stored = await this.getWorkerCommand(input.transactionId);
    if (!stored) throw new Error("command not found");

    stored.status = "completed";
    stored.result = input.result;
    stored.agentResponse = input.agentResponse;
    stored.errorMessage = input.errorMessage;
    stored.completedAt = new Date().toISOString();
    if (stored.workerId) this.refreshActiveState(stored.workerId);
    return stored;
  }

  public async cancelWorkerCommand(input: { transactionId: string; reason: string }): Promise<Command> {
    const stored = await this.getWorkerCommand(input.transactionId);
    if (!stored) throw new Error("command not found");

    stored.status = "failed";
    stored.errorMessage = input.reason;
    stored.completedAt = new Date().toISOString();
    if (stored.workerId) this.refreshActiveState(stored.workerId);
    return stored;
  }

  public async failStuckWorkerCommands(): Promise<Command[]> {
    return [];
  }

  private refreshActiveState(workerId: string = this.worker.workerId): void {
    const worker = this.workers.find((candidate) => candidate.workerId === workerId);
    if (!worker) return;
    const activeTransactionIds = this.commands
      .filter((command) => command.workerId === workerId && command.status === "in_progress")
      .map((command) => command.transactionId);

    worker.activeTransactionIds = activeTransactionIds;
    worker.activeTaskCount = activeTransactionIds.length;
    worker.currentTransactionId = activeTransactionIds[0];
    if (!worker.currentTransactionId) delete worker.currentTransactionId;
    worker.state = activeTransactionIds.length > 0 ? "running_command" : "started";
  }
}

function createHub(store: WorkerStore): { hub: SignalRHub; sent: SentInvocation[] } {
  const sent: SentInvocation[] = [];
  const hub = new SignalRHub(
    store,
    {} as never,
    { signCommand: (_workerId: string, transactionId: string) => `token:${transactionId}` } as never
  );

  (hub as unknown as { connections: Map<string, unknown> }).connections.set("connection-1", {
    connectionId: "connection-1",
    workerId: "worker-1",
    handshakeComplete: true,
    socket: {
      readyState: WebSocket.OPEN,
      send(payload: string) {
        const frame = JSON.parse(payload.split("\x1e")[0]) as SentInvocation;
        sent.push(frame);
      }
    }
  });

  return { hub, sent };
}

function createConnection(sent: unknown[] = []): SignalRConnection {
  return {
    connectionId: "connection-1",
    workerId: "worker-1",
    handshakeComplete: true,
    socket: {
      readyState: WebSocket.OPEN,
      send(payload: string) {
        sent.push(JSON.parse(payload.split("\x1e")[0]) as unknown);
      }
    } as WebSocket
  };
}

function createCommandDispatcher(store: WorkerStore, connections = new Map<string, SignalRConnection>()): WorkerCommandDispatcher {
  return new WorkerCommandDispatcher(
    store,
    { signCommand: (_workerId: string, transactionId: string) => `token:${transactionId}` } as ApiToWorkerTokenIssuer,
    connections
  );
}

function createWorkerRegistration(
  store: WorkerStore,
  connections = new Map<string, SignalRConnection>()
): WorkerRegistrationService {
  return new WorkerRegistrationService(
    store,
    {
      verifyAccessToken: async (token: string) => {
        if (token === "access:worker-1") return { workerId: "worker-1", apiKeyId: "api-key-1" };
        if (token === "access:worker-2") return { workerId: "worker-2", apiKeyId: "api-key-2" };
        return undefined;
      }
    } as WorkerTokenService,
    connections
  );
}

async function dispatchAll(dispatcher: { dispatchCommand(workerId: string, transactionId: string): Promise<void> }, store: FakeWorkerStore): Promise<void> {
  await Promise.all(
    store.commands.map((command) => dispatcher.dispatchCommand(store.worker.workerId, command.transactionId))
  );
}

async function testMixedCommandsFillWorkerCapacity(): Promise<void> {
  const store = new FakeWorkerStore(3, ["ai", "shell", "gitflow"]);
  const connection = createConnection();
  const connections = new Map<string, SignalRConnection>([[connection.connectionId, connection]]);
  const dispatcher = createCommandDispatcher(store, connections);
  const sent = [] as SentInvocation[];
  connection.socket.send = (payload: string) => {
    sent.push(JSON.parse(payload.split("\x1e")[0]) as SentInvocation);
  };

  await dispatchAll(dispatcher, store);

  assert.equal(store.commands.filter((command) => command.status === "in_progress").length, 3);
  assert.deepEqual(store.worker.activeTransactionIds, ["command-1", "command-2", "command-3"]);
  assert.equal(sent.length, 3);
  assert.deepEqual(sent.map((message) => message.arguments[3]), ["ai", "shell", "gitflow"]);
}

async function testConcurrentDispatchDoesNotExceedCapacity(): Promise<void> {
  const store = new FakeWorkerStore(3, ["ai", "shell", "gitflow", "ai", "shell"]);
  const connection = createConnection();
  const connections = new Map<string, SignalRConnection>([[connection.connectionId, connection]]);
  const dispatcher = createCommandDispatcher(store, connections);
  const sent = [] as SentInvocation[];
  connection.socket.send = (payload: string) => {
    sent.push(JSON.parse(payload.split("\x1e")[0]) as SentInvocation);
  };

  await dispatchAll(dispatcher, store);

  assert.equal(store.commands.filter((command) => command.status === "in_progress").length, 3);
  assert.equal(store.commands.filter((command) => command.status === "queued").length, 2);
  assert.equal(store.worker.activeTransactionIds?.length, 3);
  assert.equal(sent.length, 3);
}

async function testUnassignedQueuedCommandsAreClaimedByWorkerWithCapacity(): Promise<void> {
  const store = new FakeWorkerStore(1, []);
  store.commands.push({
    transactionId: "central-1",
    userId: "user-1",
    command: "central work",
    commandMode: "ai",
    status: "queued",
    createdAt: "2026-05-24T10:00:00.000Z"
  });
  const connection = createConnection();
  const connections = new Map<string, SignalRConnection>([[connection.connectionId, connection]]);
  const dispatcher = createCommandDispatcher(store, connections);
  const sent = [] as SentInvocation[];
  connection.socket.send = (payload: string) => {
    sent.push(JSON.parse(payload.split("\x1e")[0]) as SentInvocation);
  };

  await dispatcher.dispatchQueuedCommands(store.worker.workerId);

  assert.equal(store.commands[0].workerId, "worker-1");
  assert.equal(store.commands[0].status, "in_progress");
  assert.deepEqual(store.worker.activeTransactionIds, ["central-1"]);
  assert.equal(sent.length, 1);
}

async function testLocalRepositoryMatchesArePreferredForCentralQueue(): Promise<void> {
  const store = new FakeWorkerStore(1, []);
  store.localRepositoriesByWorker.set("worker-1", new Set(["repo-local"]));
  store.commands.push(
    {
      transactionId: "central-non-local",
      userId: "user-1",
      command: "non-local",
      commandMode: "gitflow",
      repositoryUrl: "https://example.com/non-local.git",
      normalizedRepositoryUrl: "repo-non-local",
      status: "queued",
      createdAt: "2026-05-24T10:00:00.000Z"
    },
    {
      transactionId: "central-local",
      userId: "user-1",
      command: "local",
      commandMode: "gitflow",
      repositoryUrl: "https://example.com/local.git",
      normalizedRepositoryUrl: "repo-local",
      status: "queued",
      createdAt: "2026-05-24T10:00:01.000Z"
    }
  );
  const connection = createConnection();
  const connections = new Map<string, SignalRConnection>([[connection.connectionId, connection]]);
  const dispatcher = createCommandDispatcher(store, connections);
  const sent = [] as SentInvocation[];
  connection.socket.send = (payload: string) => {
    sent.push(JSON.parse(payload.split("\x1e")[0]) as SentInvocation);
  };

  await dispatcher.dispatchQueuedCommands("worker-1");

  assert.equal(store.commands.find((command) => command.transactionId === "central-local")?.status, "in_progress");
  assert.equal(store.commands.find((command) => command.transactionId === "central-local")?.workerId, "worker-1");
  assert.equal(sent[0].arguments[1], "central-local");
}

async function testNonLocalCentralTasksStillDispatchWhenNoLocalMatchExists(): Promise<void> {
  const store = new FakeWorkerStore(1, []);
  store.localRepositoriesByWorker.set("worker-1", new Set(["repo-other"]));
  store.commands.push({
    transactionId: "central-non-local",
    userId: "user-1",
    command: "non-local",
    commandMode: "gitflow",
    repositoryUrl: "https://example.com/non-local.git",
    normalizedRepositoryUrl: "repo-non-local",
    status: "queued",
    createdAt: "2026-05-24T10:00:00.000Z"
  });
  const connection = createConnection();
  const connections = new Map<string, SignalRConnection>([[connection.connectionId, connection]]);
  const dispatcher = createCommandDispatcher(store, connections);
  const sent = [] as SentInvocation[];
  connection.socket.send = (payload: string) => {
    sent.push(JSON.parse(payload.split("\x1e")[0]) as SentInvocation);
  };

  await dispatcher.dispatchQueuedCommands("worker-1");

  assert.equal(store.commands[0].status, "in_progress");
  assert.equal(store.commands[0].workerId, "worker-1");
  assert.equal(sent.length, 1);
}

async function testCentralQueueFillsCapacityAfterCompletion(): Promise<void> {
  const store = new FakeWorkerStore(1, []);
  store.commands.push(
    {
      transactionId: "central-1",
      userId: "user-1",
      command: "first",
      commandMode: "ai",
      status: "queued",
      createdAt: "2026-05-24T10:00:00.000Z"
    },
    {
      transactionId: "central-2",
      userId: "user-1",
      command: "second",
      commandMode: "ai",
      status: "queued",
      createdAt: "2026-05-24T10:00:01.000Z"
    }
  );
  const connection = createConnection();
  const connections = new Map<string, SignalRConnection>([[connection.connectionId, connection]]);
  const dispatcher = createCommandDispatcher(store, connections);
  const sent = [] as SentInvocation[];
  connection.socket.send = (payload: string) => {
    sent.push(JSON.parse(payload.split("\x1e")[0]) as SentInvocation);
  };

  await dispatcher.dispatchQueuedCommands("worker-1");
  await store.completeWorkerCommand({ transactionId: "central-1", result: null, errorMessage: null });
  await dispatcher.dispatchQueuedCommands("worker-1");

  assert.deepEqual(store.worker.activeTransactionIds, ["central-2"]);
  assert.equal(store.commands.find((command) => command.transactionId === "central-2")?.workerId, "worker-1");
  assert.deepEqual(sent.map((message) => message.arguments[1]), ["central-1", "central-2"]);
}

async function testWorkersWithoutGitSkillDoNotClaimGitflowTasks(): Promise<void> {
  const store = new FakeWorkerStore(1, []);
  store.worker.skills = [];
  store.commands.push({
    transactionId: "central-gitflow",
    userId: "user-1",
    command: "gitflow",
    commandMode: "gitflow",
    repositoryUrl: "https://example.com/repo.git",
    normalizedRepositoryUrl: "repo",
    status: "queued",
    createdAt: "2026-05-24T10:00:00.000Z"
  });
  const connection = createConnection();
  const connections = new Map<string, SignalRConnection>([[connection.connectionId, connection]]);
  const dispatcher = createCommandDispatcher(store, connections);
  const sent = [] as SentInvocation[];
  connection.socket.send = (payload: string) => {
    sent.push(JSON.parse(payload.split("\x1e")[0]) as SentInvocation);
  };

  await dispatcher.dispatchQueuedCommands("worker-1");

  assert.equal(store.commands[0].status, "queued");
  assert.equal(store.commands[0].workerId, undefined);
  assert.equal(sent.length, 0);
}

async function testDisabledWorkersDoNotClaimQueuedCommands(): Promise<void> {
  const store = new FakeWorkerStore(2, ["ai"]);
  store.worker.enabled = false;
  store.commands.push({
    transactionId: "central-1",
    userId: "user-1",
    command: "central",
    commandMode: "ai",
    status: "queued",
    createdAt: "2026-05-24T10:00:00.000Z"
  });
  const connection = createConnection();
  const connections = new Map<string, SignalRConnection>([[connection.connectionId, connection]]);
  const dispatcher = createCommandDispatcher(store, connections);
  const sent = [] as SentInvocation[];
  connection.socket.send = (payload: string) => {
    sent.push(JSON.parse(payload.split("\x1e")[0]) as SentInvocation);
  };

  await dispatcher.dispatchQueuedCommands("worker-1");

  assert.deepEqual(store.commands.map((command) => command.status), ["queued", "queued"]);
  assert.equal(store.commands[1].workerId, undefined);
  assert.equal(sent.length, 0);
}

async function testBackfillsAvailableSlotsAfterCompletionAndCancel(): Promise<void> {
  const store = new FakeWorkerStore(3, ["ai", "shell", "gitflow", "ai", "shell"]);
  const { hub, sent } = createHub(store);

  await dispatchAll(hub, store);
  await store.completeWorkerCommand({ transactionId: "command-1", workerId: store.worker.workerId, result: null, errorMessage: null });
  await hub.dispatchCommand(store.worker.workerId, "command-4");
  await store.cancelWorkerCommand({ transactionId: "command-2", workerId: store.worker.workerId, reason: "cancelled" });
  await hub.dispatchCommand(store.worker.workerId, "command-5");

  assert.deepEqual(store.worker.activeTransactionIds, ["command-3", "command-4", "command-5"]);
  assert.equal(sent.length, 5);
}

async function testRegistrationRejectsMismatchedTokenAndRemapsConnection(): Promise<void> {
  const store = new FakeWorkerStore(1, []);
  const sent: unknown[] = [];
  const connection = createConnection(sent);
  connection.connectionId = "temporary-connection";
  const connections = new Map<string, SignalRConnection>([[connection.connectionId, connection]]);
  const registration = createWorkerRegistration(store, connections);

  await assert.rejects(
    registration.registerWorker(connection, ["access:worker-2", "connection-2", "worker-1"]),
    /access token does not belong to this worker/
  );

  await registration.registerWorker(connection, [
    "access:worker-1",
    "connection-registered",
    "worker-1",
    "/repo| /other ",
    "git|npm|unknown|git",
    "4",
    "ai|gitflow|unknown|ai"
  ]);

  assert.equal(connection.connectionId, "connection-registered");
  assert.equal(connections.has("temporary-connection"), false);
  assert.equal(connections.get("connection-registered"), connection);
  assert.deepEqual(store.registeredInput, {
    workerId: "worker-1",
    apiKeyId: "api-key-1",
    connectionId: "connection-registered",
    paths: ["/repo", "/other"],
    skills: ["git", "npm"],
    enabledTaskTypes: ["ai", "gitflow"],
    maxConcurrentTasks: 4
  });
}

async function testRegistrationDefaultsTaskTypesForOlderClients(): Promise<void> {
  const store = new FakeWorkerStore(1, []);
  const connection = createConnection();
  const registration = createWorkerRegistration(store);

  await registration.registerWorker(connection, [
    "access:worker-1",
    "connection-registered",
    "worker-1",
    "",
    "",
    1
  ]);

  assert.deepEqual((store.registeredInput as { enabledTaskTypes: CommandMode[] }).enabledTaskTypes, ["ai", "shell", "gitflow"]);
}

async function testDispatcherFailsDisabledCommandModes(): Promise<void> {
  const store = new FakeWorkerStore(2, ["gitflow", "ai"], ["ai"]);
  const connection = createConnection();
  const connections = new Map<string, SignalRConnection>([[connection.connectionId, connection]]);
  const dispatcher = createCommandDispatcher(store, connections);
  const sent = [] as SentInvocation[];
  connection.socket.send = (payload: string) => {
    sent.push(JSON.parse(payload.split("\x1e")[0]) as SentInvocation);
  };

  await dispatcher.dispatchCommand(store.worker.workerId, "command-1");

  assert.equal(store.commands[0].status, "failed");
  assert.equal(store.commands[0].errorMessage, "worker is not enabled for commandMode gitflow");
  assert.equal(store.commands[1].status, "in_progress");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].arguments[3], "ai");
}

async function testCommandResultCompletesOutputStorageAndMetadata(): Promise<void> {
  const store = new FakeWorkerStore(1, ["gitflow"]);
  store.commands[0].status = "in_progress";
  store.worker.activeTransactionIds = [store.commands[0].transactionId];
  store.worker.state = "running_command";
  const connection = createConnection();
  const registration = createWorkerRegistration(store);
  const storage = {
    completeCommand: async () => ({
      outputObjectKey: "workers/worker-1/commands/command-1/output.ndjson",
      outputBytes: 123,
      outputStartedAt: "2026-05-23T10:00:00.000Z",
      outputUpdatedAt: "2026-05-23T10:00:01.000Z"
    })
  } as CommandOutputStorage;
  const results = new CommandResultService(
    store,
    { signCommand: (_workerId: string, transactionId: string) => `token:${transactionId}` } as ApiToWorkerTokenIssuer,
    registration,
    storage
  );

  await results.recordCommandResult(connection, [
    "access:worker-1",
    "command-1",
    "logs\nAI summary: done",
    null
  ]);

  assert.equal(store.commands[0].status, "completed");
  assert.equal(store.commands[0].agentResponse, "done");
  assert.deepEqual(store.outputMetadataInput, {
    transactionId: "command-1",
    workerId: "worker-1",
    outputObjectKey: "workers/worker-1/commands/command-1/output.ndjson",
    outputBytes: 123,
    outputStartedAt: "2026-05-23T10:00:00.000Z",
    outputUpdatedAt: "2026-05-23T10:00:01.000Z"
  });
}

async function testCommandOutputChunkRejectsQueuedAndNonOwnedCommands(): Promise<void> {
  const store = new FakeWorkerStore(1, ["ai"]);
  const connection = createConnection();
  const registration = createWorkerRegistration(store);
  const storage = {
    appendChunk: async () => undefined
  } as CommandOutputStorage;
  const results = new CommandResultService(
    store,
    { signCommand: (_workerId: string, transactionId: string) => `token:${transactionId}` } as ApiToWorkerTokenIssuer,
    registration,
    storage
  );

  await assert.rejects(
    results.recordCommandOutputChunk(connection, ["access:worker-1", "command-1", 1, "stdout", "hello"]),
    /command is not in progress/
  );

  store.commands[0].status = "in_progress";
  connection.workerId = "worker-2";
  await assert.rejects(
    results.recordCommandOutputChunk(connection, ["access:worker-2", "command-1", 1, "stdout", "hello"]),
    /command does not belong to this worker/
  );
}

async function testInvocationDispatcherSendsKnownUnknownAndFailureCompletions(): Promise<void> {
  const store = new FakeWorkerStore(1, []);
  const sent: Array<{ invocationId: string; result?: unknown; error?: string }> = [];
  const connection = createConnection(sent);
  const connections = new Map<string, SignalRConnection>([[connection.connectionId, connection]]);
  const registration = createWorkerRegistration(store, connections);
  const commands = createCommandDispatcher(store, connections);
  const results = new CommandResultService(
    store,
    { signCommand: (_workerId: string, transactionId: string) => `token:${transactionId}` } as ApiToWorkerTokenIssuer,
    registration
  );
  const invocations = new SignalRInvocationDispatcher(registration, results, commands);

  await invocations.handleInvocation(connection, { type: 1, invocationId: "1", target: "Handshake", arguments: [] });
  await invocations.handleInvocation(connection, { type: 1, invocationId: "2", target: "Missing", arguments: [] });
  await invocations.handleInvocation(connection, { type: 1, invocationId: "3", target: "Register", arguments: [] });

  assert.deepEqual(sent[0], { type: 3, invocationId: "1", result: "ok" });
  assert.deepEqual(sent[1], { type: 3, invocationId: "2", error: "Unknown hub method: Missing" });
  assert.deepEqual(sent[2], { type: 3, invocationId: "3", error: "accessToken is required" });
}

await testMixedCommandsFillWorkerCapacity();
await testConcurrentDispatchDoesNotExceedCapacity();
await testUnassignedQueuedCommandsAreClaimedByWorkerWithCapacity();
await testLocalRepositoryMatchesArePreferredForCentralQueue();
await testNonLocalCentralTasksStillDispatchWhenNoLocalMatchExists();
await testCentralQueueFillsCapacityAfterCompletion();
await testWorkersWithoutGitSkillDoNotClaimGitflowTasks();
await testDisabledWorkersDoNotClaimQueuedCommands();
await testBackfillsAvailableSlotsAfterCompletionAndCancel();
await testRegistrationRejectsMismatchedTokenAndRemapsConnection();
await testRegistrationDefaultsTaskTypesForOlderClients();
await testDispatcherFailsDisabledCommandModes();
await testCommandResultCompletesOutputStorageAndMetadata();
await testCommandOutputChunkRejectsQueuedAndNonOwnedCommands();
await testInvocationDispatcherSendsKnownUnknownAndFailureCompletions();

console.log("signalRHub dispatch tests passed");
