import { WebSocket } from "ws";
import { WorkerAccessPayload } from "../../auth/workerAuthTypes.js";
import { WorkerTokenService } from "../../auth/workerTokens.js";
import { normalizeEnabledTaskTypes } from "../../commandModes.js";
import { WorkerStore } from "../../store/clientStore.js";
import { normalizeMaxConcurrentTasks } from "../../workers/workerState.js";
import { readRequiredString, readString } from "../shared/argumentReaders.js";
import { HubConnectionRegistry, SignalRConnection } from "../shared/types.js";

export class WorkerRegistrationService {
  public constructor(
    private readonly store: WorkerStore,
    private readonly workerTokens: WorkerTokenService,
    private readonly connections: HubConnectionRegistry
  ) {}

  public async registerWorker(connection: SignalRConnection, args: unknown[]): Promise<void> {
    const previousConnectionId = connection.connectionId;
    const access = await this.readWorkerAccess(args[0]);
    const connectionId = readString(args[1]) || connection.connectionId;
    const workerId = readRequiredString(args[2], "workerId");
    if (access.workerId !== workerId) {
      throw new Error("access token does not belong to this worker");
    }

    const paths = readString(args[3])
      .split("|")
      .map((path) => path.trim())
      .filter(Boolean);
    const skills = normalizeSkills(readString(args[4]));
    const maxConcurrentTasks = normalizeMaxConcurrentTasks(args[5]);
    const enabledTaskTypes = normalizeEnabledTaskTypes(args[6]);

    await this.markStaleWorkerStopped(workerId, connectionId);

    connection.connectionId = connectionId;
    connection.workerId = workerId;

    await this.store.registerWorker({
      workerId,
      userId: access.userId,
      connectionId,
      paths,
      skills,
      enabledTaskTypes,
      maxConcurrentTasks
    });

    if (previousConnectionId !== connectionId) {
      this.connections.delete(previousConnectionId);
    }
    this.connections.set(connectionId, connection);
  }

  public async handleClientClosed(connection: SignalRConnection): Promise<void> {
    if (!connection.workerId) return;

    await this.store.markWorkerStopped(connection.workerId, connection.connectionId);
  }

  public async requireConnectionAccess(connection: SignalRConnection, value: unknown): Promise<WorkerAccessPayload> {
    const access = await this.readWorkerAccess(value);
    if (!connection.workerId || access.workerId !== connection.workerId) {
      throw new Error("access token does not belong to this connection");
    }

    return access;
  }

  private async readWorkerAccess(value: unknown): Promise<WorkerAccessPayload> {
    const accessToken = readRequiredString(value, "accessToken");
    const access = await this.workerTokens.verifyAccessToken(accessToken);
    if (!access) {
      throw new Error("invalid worker access token");
    }

    return access;
  }

  private async markStaleWorkerStopped(workerId: string, connectionId: string): Promise<void> {
    const existing = await this.store.getWorker(workerId);
    if (!existing || existing.connectionId === connectionId || existing.state === "stopped") return;

    const existingConnection = this.connections.get(existing.connectionId);
    if (existingConnection?.socket.readyState === WebSocket.OPEN) return;

    await this.store.markWorkerStopped(workerId, existing.connectionId);
  }
}

function normalizeSkills(value: string): string[] {
  const knownSkills = new Set(["git", "npm"]);
  const skills = value
    .split("|")
    .map((skill) => skill.trim().toLowerCase())
    .filter(Boolean);

  return [...new Set(skills)].filter((skill) => knownSkills.has(skill));
}
