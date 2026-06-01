import {
  workerHubCommandOutputChunkArguments,
  workerHubCommandResultArguments,
  workerHubRefreshCommandTokenArguments,
  workerHubRejectCommandArguments
} from "../../contracts/workerHubContract.js";
import { ApiToWorkerTokenIssuer } from "../../auth/workerTokens.js";
import { CommandOutputStorage } from "../../storage/commandOutputStorage.js";
import { WorkerStore } from "../../store/clientStore.js";
import { Command } from "../../types.js";
import {
  readNullableString,
  readOutputStream,
  readRequiredNumber,
  readRequiredString,
  readString
} from "../shared/argumentReaders.js";
import { extractAgentResponse } from "./commandResultHelpers.js";
import { SignalRConnection, CommandLifecycleObserver } from "../shared/types.js";
import { WorkerRegistrationService } from "../workers/workerRegistrationService.js";

export class CommandResultService {
  public constructor(
    private readonly store: WorkerStore,
    private readonly apiToWorkerTokens: ApiToWorkerTokenIssuer,
    private readonly workerRegistration: WorkerRegistrationService,
    private readonly outputStorage?: CommandOutputStorage,
    private readonly lifecycle?: CommandLifecycleObserver
  ) {}

  public async recordCommandResult(connection: SignalRConnection, args: unknown[]): Promise<void> {
    await this.workerRegistration.requireConnectionAccess(connection, args[workerHubCommandResultArguments.accessToken]);
    const transactionId = readRequiredString(args[workerHubCommandResultArguments.transactionId], "transactionId");
    const result = readNullableString(args[workerHubCommandResultArguments.result]);
    let errorMessage = readNullableString(args[workerHubCommandResultArguments.errorMessage]);
    const command = await this.store.getWorkerCommand(transactionId);
    if (!command) {
      throw new Error("command not found");
    }

    if (!connection.workerId || command.workerId !== connection.workerId) {
      throw new Error("command does not belong to this worker");
    }

    if (command.status !== "in_progress") {
      return;
    }

    if (this.outputStorage) {
      try {
        const outputMetadata = await this.outputStorage.completeCommand(command.workerId, transactionId);
        if (outputMetadata) {
          await this.store.recordWorkerCommandOutputMetadata({
            transactionId,
            workerId: connection.workerId,
            ...outputMetadata
          });
        }
      } catch (error) {
        const storageError = `command output storage failed: ${error instanceof Error ? error.message : String(error)}`;
        errorMessage = errorMessage ? `${errorMessage}; ${storageError}` : storageError;
      }
    }

    const agentResponse = result ? extractAgentResponse(command.commandMode, result) : null;
    const completedCommand = await this.store.completeWorkerCommand({
      transactionId,
      workerId: connection.workerId,
      result,
      agentResponse,
      errorMessage
    });
    this.notifyCommandCompleted(completedCommand);
  }

  public async recordCommandOutputChunk(connection: SignalRConnection, args: unknown[]): Promise<void> {
    await this.workerRegistration.requireConnectionAccess(connection, args[workerHubCommandOutputChunkArguments.accessToken]);
    if (!this.outputStorage) {
      return;
    }

    const transactionId = readRequiredString(args[workerHubCommandOutputChunkArguments.transactionId], "transactionId");
    const command = await this.store.getWorkerCommand(transactionId);
    if (!command) {
      throw new Error("command not found");
    }

    if (!connection.workerId || command.workerId !== connection.workerId) {
      throw new Error("command does not belong to this worker");
    }

    if (command.status === "queued") {
      throw new Error("command is not in progress");
    }

    if (command.status !== "in_progress") {
      return;
    }

    await this.outputStorage.appendChunk({
      workerId: command.workerId,
      transactionId,
      sequence: readRequiredNumber(args[workerHubCommandOutputChunkArguments.sequence], "sequence"),
      stream: readOutputStream(args[workerHubCommandOutputChunkArguments.stream]),
      text: readString(args[workerHubCommandOutputChunkArguments.text]),
      emittedAt: readString(args[workerHubCommandOutputChunkArguments.emittedAt]) || new Date().toISOString()
    });
  }

  public async refreshCommandToken(connection: SignalRConnection, args: unknown[]): Promise<string> {
    await this.workerRegistration.requireConnectionAccess(connection, args[workerHubRefreshCommandTokenArguments.accessToken]);
    const transactionId = readRequiredString(args[workerHubRefreshCommandTokenArguments.transactionId], "transactionId");
    const command = await this.store.getWorkerCommand(transactionId);
    if (!command) {
      throw new Error("command not found");
    }

    if (!connection.workerId || command.workerId !== connection.workerId) {
      throw new Error("command does not belong to this worker");
    }

    if (command.status !== "in_progress") {
      throw new Error("command is not in progress");
    }

    return this.apiToWorkerTokens.signCommand(command.workerId, command.transactionId);
  }

  public async rejectCommand(connection: SignalRConnection, args: unknown[]): Promise<void> {
    await this.workerRegistration.requireConnectionAccess(connection, args[workerHubRejectCommandArguments.accessToken]);
    const transactionId = readRequiredString(args[workerHubRejectCommandArguments.transactionId], "transactionId");
    const reason = readString(args[workerHubRejectCommandArguments.reason]) || "worker rejected command";
    const command = await this.store.getWorkerCommand(transactionId);
    if (!command) {
      throw new Error("command not found");
    }

    if (!connection.workerId || command.workerId !== connection.workerId) {
      throw new Error("command does not belong to this worker");
    }

    if (command.status !== "in_progress") {
      return;
    }

    const completedCommand = await this.store.completeWorkerCommand({
      transactionId,
      workerId: connection.workerId,
      result: null,
      agentResponse: null,
      errorMessage: reason
    });
    this.notifyCommandCompleted(completedCommand);
  }

  private notifyCommandCompleted(command: Command): void {
    this.lifecycle?.commandCompleted(command).catch((error) => {
      console.error("error handling command completed lifecycle", {
        transactionId: command.transactionId,
        status: command.status,
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }
}
