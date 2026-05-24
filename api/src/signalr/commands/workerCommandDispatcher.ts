import { WebSocket } from "ws";
import { ApiToWorkerTokenIssuer } from "../../auth/workerTokens.js";
import { isTaskTypeEnabled } from "../../commandModes.js";
import { WorkerStore } from "../../store/clientStore.js";
import { Command } from "../../types.js";
import { canDispatchMoreCommands } from "../../workers/workerState.js";
import { invocationMessage } from "../protocol.js";
import { CommandLifecycleObserver, HubConnectionRegistry, SignalRConnection } from "../shared/types.js";

const stuckCommandTimeoutMinutes = 30;

export class WorkerCommandDispatcher {
  private readonly workerDispatchLocks = new Map<string, Promise<unknown>>();

  public constructor(
    private readonly store: WorkerStore,
    private readonly apiToWorkerTokens: ApiToWorkerTokenIssuer,
    private readonly connections: HubConnectionRegistry,
    private readonly lifecycle?: CommandLifecycleObserver
  ) {}

  public async dispatchCommand(workerId: string, transactionId: string): Promise<void> {
    await this.failStuckCommands(false);

    const command = await this.store.getWorkerCommand(transactionId);
    if (!command) return;
    if (command.workerId !== workerId) return;
    if (command.status !== "queued") return;

    await this.dispatchQueuedCommands(workerId);
  }

  public async dispatchQueuedCommands(workerId?: string): Promise<void> {
    if (!workerId) {
      const workers = await this.store.listWorkers();
      await Promise.all(workers.map((worker) => this.dispatchQueuedCommands(worker.workerId)));
      return;
    }

    await this.withWorkerDispatchLock(workerId, async () => {
      while (true) {
        const client = await this.store.getWorker(workerId);
        if (!client || !client.enabled || !canDispatchMoreCommands(client)) return;

        const connection = this.connections.get(client.connectionId);
        if (!connection || connection.socket.readyState !== WebSocket.OPEN) return;

        const queuedCommands = await this.store.getDispatchableQueuedCommands(workerId, client.skills);
        if (queuedCommands.length === 0) return;

        let claimedCommand = false;
        for (const nextCommand of queuedCommands) {
          const latestClient = await this.store.getWorker(workerId);
          if (!latestClient || !latestClient.enabled || !canDispatchMoreCommands(latestClient)) return;

          if (!isTaskTypeEnabled(latestClient.enabledTaskTypes, nextCommand.commandMode)) {
            await this.store.cancelWorkerCommand({
              transactionId: nextCommand.transactionId,
              workerId,
              reason: `worker is not enabled for commandMode ${nextCommand.commandMode}`
            });
            claimedCommand = true;
            continue;
          }

          const claimed = await this.store.markWorkerCommandInProgress(nextCommand, workerId);
          
          if (!claimed) continue;
          if (!claimed.workerId) continue;

          claimedCommand = true;
          await this.notifyCommandStarted(claimed);
          this.sendInvocation(connection, "ExecuteCommand", [
            this.apiToWorkerTokens.signCommand(claimed.workerId, claimed.transactionId),
            claimed.transactionId,
            claimed.executionCommand ?? claimed.command,
            claimed.commandMode
          ]);
          break;
        }

        if (!claimedCommand) return;
      }
    });
  }

  public async failStuckCommands(dispatchQueued: boolean): Promise<void> {
    const failedCommands = await this.store.failStuckWorkerCommands(stuckCommandTimeoutMinutes);
    if (!dispatchQueued || failedCommands.length === 0) return;

    const workerIds = new Set(failedCommands.map((command) => command.workerId).filter((failedWorkerId): failedWorkerId is string => Boolean(failedWorkerId)));
    await Promise.all([...workerIds].map((workerId) => this.dispatchQueuedCommands(workerId)));
  }

  private sendInvocation(connection: SignalRConnection, target: string, args: unknown[]): void {
    connection.socket.send(invocationMessage(target, args));
  }

  private async notifyCommandStarted(command: Command): Promise<void> {
    try {
      await this.lifecycle?.commandStarted(command);
    } catch (error) {
      console.error("error handling command started lifecycle", {
        transactionId: command.transactionId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async withWorkerDispatchLock<T>(workerId: string, action: () => Promise<T>): Promise<T> {
    const previous = this.workerDispatchLocks.get(workerId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(action);
    const next = run.catch(() => undefined);
    this.workerDispatchLocks.set(workerId, next);

    try {
      return await run;
    } finally {
      if (this.workerDispatchLocks.get(workerId) === next) {
        this.workerDispatchLocks.delete(workerId);
      }
    }
  }
}
