import { WebSocket } from "ws";
import { WorkerAccessPayload } from "../../auth/workerAuthTypes.js";
import { WorkerTokenService } from "../../auth/workerTokens.js";
import { normalizeEnabledTaskTypes } from "../../commandModes.js";
import { workerHubRegisterArguments } from "../../contracts/workerHubContract.js";
import { WorkerStore } from "../../store/clientStore.js";
import { GitRepositoryStore, WorkerGitRepositoryInput } from "../../store/gitRepositories/gitRepositoryStore.js";
import { JiraIntegrationStore, WorkerJiraIntegrationInput } from "../../store/integrations/jiraIntegrationStore.js";
import { normalizeMaxConcurrentTasks } from "../../workers/workerState.js";
import { readRequiredString, readString } from "../shared/argumentReaders.js";
import { HubConnectionRegistry, SignalRConnection } from "../shared/types.js";

export class WorkerRegistrationService {
  public constructor(
    private readonly store: WorkerStore,
    private readonly workerTokens: WorkerTokenService,
    private readonly connections: HubConnectionRegistry,
    private readonly gitRepositories?: GitRepositoryStore,
    private readonly jiraIntegrations?: JiraIntegrationStore
  ) {}

  public async registerWorker(connection: SignalRConnection, args: unknown[]): Promise<void> {
    const previousConnectionId = connection.connectionId;
    const access = await this.readWorkerAccess(args[workerHubRegisterArguments.accessToken]);
    const connectionId = readString(args[workerHubRegisterArguments.connectionId]) || connection.connectionId;
    const workerId = readRequiredString(args[workerHubRegisterArguments.workerId], "workerId");
    if (access.workerId !== workerId) {
      throw new Error("access token does not belong to this worker");
    }

    const paths = readString(args[workerHubRegisterArguments.paths])
      .split("|")
      .map((path) => path.trim())
      .filter(Boolean);
    const skills = normalizeSkills(readString(args[workerHubRegisterArguments.skills]));
    const maxConcurrentTasks = normalizeMaxConcurrentTasks(args[workerHubRegisterArguments.maxConcurrentTasks]);
    const enabledTaskTypes = normalizeEnabledTaskTypes(args[workerHubRegisterArguments.enabledTaskTypes]);
    const repositories = readWorkerRepositories(args[workerHubRegisterArguments.gitRepositories]);
    const integrations = readWorkerJiraIntegrations(args[workerHubRegisterArguments.jiraIntegrations]);

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
    await this.gitRepositories?.syncWorkerRepositories(workerId, repositories);
    await this.jiraIntegrations?.syncWorkerIntegrations(workerId, access.userId, integrations);

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

function readWorkerJiraIntegrations(value: unknown): WorkerJiraIntegrationInput[] {
  if (value === undefined || value === null || value === "") return [];

  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item): WorkerJiraIntegrationInput | undefined => {
      if (!item || typeof item !== "object") return undefined;
      const payload = item as Record<string, unknown>;
      const integrationId = readString(payload.IntegrationId ?? payload.integrationId);
      const siteUrl = readString(payload.SiteUrl ?? payload.siteUrl);
      const email = readString(payload.Email ?? payload.email);
      const apiToken = readString(payload.ApiToken ?? payload.apiToken);
      const boardId = readInteger(payload.BoardId ?? payload.boardId);
      const boardName = readString(payload.BoardName ?? payload.boardName);
      const boardType = readString(payload.BoardType ?? payload.boardType);
      const boardFilterId = readOptionalInteger(payload.BoardFilterId ?? payload.boardFilterId);
      const readyStatusId = readString(payload.ReadyStatusId ?? payload.readyStatusId);
      const readyStatusName = readString(payload.ReadyStatusName ?? payload.readyStatusName);
      const processingStatusId = readString(payload.ProcessingStatusId ?? payload.processingStatusId);
      const processingStatusName = readString(payload.ProcessingStatusName ?? payload.processingStatusName);
      const processedStatusId = readString(payload.ProcessedStatusId ?? payload.processedStatusId);
      const processedStatusName = readString(payload.ProcessedStatusName ?? payload.processedStatusName);
      if (
        !integrationId ||
        !siteUrl ||
        !email ||
        !apiToken ||
        !boardId ||
        !boardName ||
        !boardType ||
        !readyStatusId ||
        !readyStatusName ||
        !processingStatusId ||
        !processingStatusName ||
        !processedStatusId ||
        !processedStatusName
      ) {
        return undefined;
      }
      return {
        integrationId,
        enabled: readBoolean(payload.Enabled ?? payload.enabled),
        siteUrl,
        email,
        apiToken,
        boardId,
        boardName,
        boardType,
        boardFilterId,
        readyStatusId,
        readyStatusName,
        processingStatusId,
        processingStatusName,
        processedStatusId,
        processedStatusName,
      };
    })
    .filter((integration): integration is WorkerJiraIntegrationInput => Boolean(integration));
}

function readInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return undefined;
}

function readOptionalInteger(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return readInteger(value);
}

function readBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return ["true", "yes", "1"].includes(value.trim().toLowerCase());
  }
  return false;
}

function readWorkerRepositories(value: unknown): WorkerGitRepositoryInput[] {
  if (value === undefined || value === null || value === "") return [];

  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item): WorkerGitRepositoryInput | undefined => {
      if (!item || typeof item !== "object") return undefined;
      const payload = item as Record<string, unknown>;
      const repositoryUrl = readString(payload.RepositoryUrl ?? payload.repositoryUrl);
      const normalizedRepositoryUrl = readString(payload.NormalizedRepositoryUrl ?? payload.normalizedRepositoryUrl);
      const sourceBranch = readString(payload.SourceBranch ?? payload.sourceBranch);
      const targetBranch = readString(payload.TargetBranch ?? payload.targetBranch);
      if (!repositoryUrl || !sourceBranch || !targetBranch) return undefined;
      return { repositoryUrl, normalizedRepositoryUrl, sourceBranch, targetBranch };
    })
    .filter((repository): repository is WorkerGitRepositoryInput => Boolean(repository));
}

function normalizeSkills(value: string): string[] {
  const knownSkills = new Set(["git", "npm"]);
  const skills = value
    .split("|")
    .map((skill) => skill.trim().toLowerCase())
    .filter(Boolean);

  return [...new Set(skills)].filter((skill) => knownSkills.has(skill));
}
