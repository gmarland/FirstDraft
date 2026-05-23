import { completionMessage, SignalRInvocationMessage } from "../protocol.js";
import { CommandResultService } from "../commands/commandResultService.js";
import { WorkerCommandDispatcher } from "../commands/workerCommandDispatcher.js";
import { SignalRConnection } from "../shared/types.js";
import { WorkerRegistrationService } from "../workers/workerRegistrationService.js";

export class SignalRInvocationDispatcher {
  public constructor(
    private readonly workerRegistration: WorkerRegistrationService,
    private readonly commandResults: CommandResultService,
    private readonly commands: WorkerCommandDispatcher
  ) {}

  public async handleInvocation(connection: SignalRConnection, message: SignalRInvocationMessage): Promise<void> {
    try {
      if (message.target === "Handshake") {
        this.sendCompletion(connection, message.invocationId, "ok");
        return;
      }

      if (message.target === "Register") {
        await this.workerRegistration.registerWorker(connection, message.arguments ?? []);
        this.sendCompletion(connection, message.invocationId);
        await this.commands.dispatchQueuedCommands(connection.workerId);
        return;
      }

      if (message.target === "ExecuteCommandResult") {
        await this.commandResults.recordCommandResult(connection, message.arguments ?? []);
        this.sendCompletion(connection, message.invocationId);
        await this.commands.dispatchQueuedCommands(connection.workerId);
        return;
      }

      if (message.target === "CommandOutputChunk") {
        await this.commandResults.recordCommandOutputChunk(connection, message.arguments ?? []);
        this.sendCompletion(connection, message.invocationId);
        return;
      }

      if (message.target === "RefreshCommandToken") {
        const token = await this.commandResults.refreshCommandToken(connection, message.arguments ?? []);
        this.sendCompletion(connection, message.invocationId, token);
        return;
      }

      if (message.target === "RejectCommand") {
        await this.commandResults.rejectCommand(connection, message.arguments ?? []);
        this.sendCompletion(connection, message.invocationId);
        await this.commands.dispatchQueuedCommands(connection.workerId);
        return;
      }

      this.sendCompletion(connection, message.invocationId, undefined, `Unknown hub method: ${message.target}`);
    } catch (error) {
      this.sendCompletion(connection, message.invocationId, undefined, error instanceof Error ? error.message : String(error));
    }
  }

  public sendUnsupportedMessageCompletion(connection: SignalRConnection, message: SignalRInvocationMessage): void {
    this.sendCompletion(
      connection,
      message.invocationId,
      undefined,
      `Unsupported SignalR message type: ${message.type}`
    );
  }

  private sendCompletion(
    connection: SignalRConnection,
    invocationId?: string,
    result?: unknown,
    error?: string
  ): void {
    if (!invocationId) return;
    connection.socket.send(completionMessage(invocationId, result, error));
  }
}
