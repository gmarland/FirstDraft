import { workerHubServerMethods } from "../../contracts/workerHubContract.js";
import { completionMessage, SignalRInvocationMessage } from "../protocol.js";
import { CommandResultService } from "../commands/commandResultService.js";
import { WorkerCommandDispatcher } from "../commands/workerCommandDispatcher.js";
import { SignalRConnection } from "../shared/types.js";
import { WorkerRegistrationService } from "../workers/workerRegistrationService.js";

type InvocationHandler = (connection: SignalRConnection, message: SignalRInvocationMessage) => Promise<void>;

export class SignalRInvocationDispatcher {
  private readonly handlers: ReadonlyMap<string, InvocationHandler>;

  public constructor(
    private readonly workerRegistration: WorkerRegistrationService,
    private readonly commandResults: CommandResultService,
    private readonly commands: WorkerCommandDispatcher
  ) {
    this.handlers = new Map<string, InvocationHandler>([
      [workerHubServerMethods.handshake, this.handleHandshake],
      [workerHubServerMethods.register, this.handleRegister],
      [workerHubServerMethods.executeCommandResult, this.handleExecuteCommandResult],
      [workerHubServerMethods.commandOutputChunk, this.handleCommandOutputChunk],
      [workerHubServerMethods.refreshCommandToken, this.handleRefreshCommandToken],
      [workerHubServerMethods.rejectCommand, this.handleRejectCommand],
    ]);
  }

  public async handleInvocation(connection: SignalRConnection, message: SignalRInvocationMessage): Promise<void> {
    try {
      const handler = message.target ? this.handlers.get(message.target) : undefined;
      if (handler) {
        await handler(connection, message);
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

  private readonly handleHandshake: InvocationHandler = async (connection, message) => {
    this.sendCompletion(connection, message.invocationId, "ok");
  };

  private readonly handleRegister: InvocationHandler = async (connection, message) => {
    await this.workerRegistration.registerWorker(connection, message.arguments ?? []);
    this.sendCompletion(connection, message.invocationId);
    await this.commands.dispatchQueuedCommands(connection.workerId);
  };

  private readonly handleExecuteCommandResult: InvocationHandler = async (connection, message) => {
    await this.commandResults.recordCommandResult(connection, message.arguments ?? []);
    this.sendCompletion(connection, message.invocationId);
    await this.commands.dispatchQueuedCommands(connection.workerId);
  };

  private readonly handleCommandOutputChunk: InvocationHandler = async (connection, message) => {
    await this.commandResults.recordCommandOutputChunk(connection, message.arguments ?? []);
    this.sendCompletion(connection, message.invocationId);
  };

  private readonly handleRefreshCommandToken: InvocationHandler = async (connection, message) => {
    const token = await this.commandResults.refreshCommandToken(connection, message.arguments ?? []);
    this.sendCompletion(connection, message.invocationId, token);
  };

  private readonly handleRejectCommand: InvocationHandler = async (connection, message) => {
    await this.commandResults.rejectCommand(connection, message.arguments ?? []);
    this.sendCompletion(connection, message.invocationId);
    await this.commands.dispatchQueuedCommands(connection.workerId);
  };
}
