import { Server } from "http";
import { RequestHandler } from "express";
import { nanoid } from "nanoid";
import { ApiToWorkerTokenIssuer, WorkerTokenService } from "../auth/workerTokens.js";
import { CommandOutputStorage } from "../storage/commandOutputStorage.js";
import { WorkerStore } from "../store/clientStore.js";
import { CommandResultService } from "./commands/commandResultService.js";
import { WorkerCommandDispatcher } from "./commands/workerCommandDispatcher.js";
import { SignalRInvocationDispatcher } from "./invocations/signalRInvocationDispatcher.js";
import { CommandLifecycleObserver, SignalRConnection } from "./shared/types.js";
import { SignalRTransport } from "./transport/signalRTransport.js";
import { WorkerRegistrationService } from "./workers/workerRegistrationService.js";

const stuckCommandSweepIntervalMs = 60000;

export class SignalRHub {
  private readonly connections = new Map<string, SignalRConnection>();
  private readonly workerRegistration: WorkerRegistrationService;
  private readonly commands: WorkerCommandDispatcher;
  private readonly transport: SignalRTransport;
  private stuckCommandSweep?: NodeJS.Timeout;

  public readonly negotiate: RequestHandler = (_req, res) => {
    const connectionId = nanoid();

    res.json({
      connectionId,
      connectionToken: connectionId,
      negotiateVersion: 1,
      availableTransports: [
        {
          transport: "WebSockets",
          transferFormats: ["Text"]
        }
      ]
    });
  };

  public constructor(
    store: WorkerStore,
    workerTokens: WorkerTokenService,
    apiToWorkerTokens: ApiToWorkerTokenIssuer,
    outputStorage?: CommandOutputStorage,
    lifecycle?: CommandLifecycleObserver
  ) {
    this.workerRegistration = new WorkerRegistrationService(store, workerTokens, this.connections);
    this.commands = new WorkerCommandDispatcher(store, apiToWorkerTokens, this.connections, lifecycle);

    const commandResults = new CommandResultService(
      store,
      apiToWorkerTokens,
      this.workerRegistration,
      outputStorage,
      lifecycle
    );
    const invocations = new SignalRInvocationDispatcher(
      this.workerRegistration,
      commandResults,
      this.commands
    );
    this.transport = new SignalRTransport(this.connections, invocations, this.workerRegistration);
  }

  public attach(server: Server): void {
    if (!this.stuckCommandSweep) {
      this.stuckCommandSweep = setInterval(() => {
        this.commands.failStuckCommands(true).catch((error) => {
          console.error("error failing stuck commands", error);
        });
      }, stuckCommandSweepIntervalMs);
      this.stuckCommandSweep.unref();
    }

    this.transport.attach(server);
  }

  public dispatchCommand(workerId: string, transactionId: string): Promise<void> {
    return this.commands.dispatchCommand(workerId, transactionId);
  }
}
