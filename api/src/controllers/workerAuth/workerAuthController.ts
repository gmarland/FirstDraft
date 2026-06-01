import { RequestHandler } from "express";
import { ApiToWorkerTokenIssuer, WorkerTokenService } from "../../auth/workerTokens.js";
import { normalizeEnabledTaskTypes } from "../../commandModes.js";
import { IntegrationLifecycleService } from "../../integrations/integrationLifecycleService.js";
import { CommandOutputStorage } from "../../storage/commandOutputStorage.js";
import { WorkerStore } from "../../store/clientStore.js";
import { GitRepositoryStore, normalizeRepositoryUrl, WorkerGitRepositoryInput } from "../../store/gitRepositories/gitRepositoryStore.js";
import { JiraIntegrationStore, WorkerJiraIntegrationInput } from "../../store/integrations/jiraIntegrationStore.js";
import { JiraTicketClaimStore } from "../../store/integrations/jiraTicketClaimStore.js";
import { AppStore } from "../../store/tenantStore.js";
import { Command, CommandMode } from "../../types.js";
import { normalizeMaxConcurrentTasks } from "../../workers/workerState.js";
import { readCleanString, readPlainObject } from "../../shared/readers.js";
import { asyncHandler, requireUser, requireWorkerBearerToken } from "../controllerHelpers.js";
import {
  parseWorkerTokenRequest,
  readRefreshToken,
  validateWorkerTokenRequest
} from "./workerAuthRequests.js";

export class WorkerAuthController {
  public constructor(
    private readonly tenants: AppStore,
    private readonly workers: WorkerStore,
    private readonly tokens: WorkerTokenService,
    private readonly apiToWorkerTokens: ApiToWorkerTokenIssuer,
    private readonly workerConfigEncryptionKey: string,
    private readonly outputStorage?: CommandOutputStorage,
    private readonly gitRepositories?: GitRepositoryStore,
    private readonly jiraIntegrations?: JiraIntegrationStore,
    private readonly jiraTicketClaims?: JiraTicketClaimStore,
    private readonly lifecycle?: IntegrationLifecycleService
  ) {}

  public readonly issueToken: RequestHandler = asyncHandler(async (req, res) => {
    const input = parseWorkerTokenRequest(req.body);
    const validationError = validateWorkerTokenRequest(input);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const user = requireUser(req, res);
    if (!user) return;

    res.json({
      ...(await this.tokens.issue(input.workerId!.trim(), user)),
      configEncryptionKey: this.workerConfigEncryptionKey
    });
  });

  public readonly refreshToken: RequestHandler = asyncHandler(async (req, res) => {
    const refreshToken = readRefreshToken(req.body);
    if (!refreshToken) {
      res.status(400).json({ error: "refreshToken is required" });
      return;
    }

    const tokenPair = await this.tokens.refresh(refreshToken);
    if (!tokenPair) {
      res.status(401).json({ error: "invalid refresh token" });
      return;
    }

    res.json(tokenPair);
  });

  public readonly publicKey: RequestHandler = (_req, res) => {
    res.json({
      alg: "RS256",
      publicKey: this.apiToWorkerTokens.publicKey
    });
  };

  public readonly registerWorker: RequestHandler = asyncHandler(async (req, res) => {
    const worker = await requireWorkerBearerToken(this.tokens, req.headers.authorization, res);
    if (!worker) return;

    const input = readWorkerRegistrationRequest(req.body);
    if (!input) {
      res.status(400).json({ error: "workerId is required" });
      return;
    }

    if (input.workerId !== worker.workerId) {
      res.status(403).json({ error: "access token does not belong to this worker" });
      return;
    }

    const registered = await this.workers.registerWorker({
      workerId: worker.workerId,
      userId: worker.userId,
      connectionId: `http:${worker.workerId}`,
      paths: input.paths,
      skills: input.skills,
      enabledTaskTypes: input.enabledTaskTypes,
      maxConcurrentTasks: input.maxConcurrentTasks,
    });
    await this.gitRepositories?.syncWorkerRepositories(worker.workerId, input.gitRepositories);
    await this.jiraIntegrations?.syncWorkerIntegrations(worker.workerId, worker.userId, input.jiraIntegrations);
    await this.workers.markStaleWorkersStopped(workerHeartbeatTimeoutSeconds);

    res.status(200).json(registered);
  });

  public readonly heartbeat: RequestHandler = asyncHandler(async (req, res) => {
    const worker = await requireWorkerBearerToken(this.tokens, req.headers.authorization, res);
    if (!worker) return;

    const updated = await this.workers.refreshWorkerHeartbeat(worker.workerId, worker.userId);
    await this.workers.markStaleWorkersStopped(workerHeartbeatTimeoutSeconds);
    if (!updated) {
      res.status(404).json({ error: "worker is not registered" });
      return;
    }

    res.json(updated);
  });

  public readonly startTask: RequestHandler = asyncHandler(async (req, res) => {
    const worker = await requireWorkerBearerToken(this.tokens, req.headers.authorization, res);
    if (!worker) return;

    const input = readTaskStartRequest(req.body);
    if (!input) {
      res.status(400).json({ error: "command and commandMode are required" });
      return;
    }

    const registration = await this.workers.getWorkerForUser(worker.userId, worker.workerId);
    if (!registration) {
      res.status(404).json({ error: "worker is not registered" });
      return;
    }
    if (!registration.enabledTaskTypes.includes(input.commandMode)) {
      res.status(400).json({ error: `worker is not enabled for commandMode ${input.commandMode}` });
      return;
    }

    if (input.provider === "jira") {
      if (!this.jiraTicketClaims) {
        res.status(503).json({ error: "Jira task reporting is not configured" });
        return;
      }
      if (!input.integrationId || !input.sourceItemId || !input.sourceItemKey || !input.sourceItemUrl || !input.repositoryUrl || !input.normalizedRepositoryUrl) {
        res.status(400).json({ error: "Jira tasks require integrationId, sourceItemId, sourceItemKey, sourceItemUrl, repositoryUrl, and normalizedRepositoryUrl" });
        return;
      }

      const result = await this.jiraTicketClaims.claim({
        workerId: worker.workerId,
        userId: worker.userId,
        integrationId: input.integrationId,
        sourceItemId: input.sourceItemId,
        sourceItemKey: input.sourceItemKey,
        sourceItemUrl: input.sourceItemUrl,
        ...(input.sourceAssigneeAccountId ? { sourceAssigneeAccountId: input.sourceAssigneeAccountId } : {}),
        repositoryUrl: input.repositoryUrl,
        normalizedRepositoryUrl: input.normalizedRepositoryUrl,
        command: input.command,
        metadata: input.metadata,
      });

      if (!result.claimed) {
        res.status(409).json({
          claimed: false,
          ...(result.reason ? { reason: result.reason } : {}),
          event: result.event
            ? {
                id: result.event.id,
                status: result.event.status,
                workerId: result.event.workerId,
                transactionId: result.event.transactionId,
              }
            : undefined,
        });
        return;
      }

      await this.lifecycle?.commandStarted(result.command);
      res.status(201).json({
        claimed: true,
        transactionId: result.command.transactionId,
        eventId: result.event.id,
        command: result.command,
      });
      return;
    }

    const command = await this.workers.createReportedCommand({
      userId: worker.userId,
      workerId: worker.workerId,
      command: input.command,
      executionCommand: input.executionCommand,
      commandMode: input.commandMode,
      repositoryUrl: input.repositoryUrl,
      normalizedRepositoryUrl: input.normalizedRepositoryUrl,
    });
    await this.lifecycle?.commandStarted(command);
    res.status(201).json({ transactionId: command.transactionId, command });
  });

  public readonly recordTaskOutput: RequestHandler = asyncHandler(async (req, res) => {
    const worker = await requireWorkerBearerToken(this.tokens, req.headers.authorization, res);
    if (!worker) return;
    if (!this.outputStorage) {
      res.status(204).end();
      return;
    }

    const command = await this.requireWorkerCommand(worker.workerId, req.params.transactionId, res);
    if (!command) return;
    if (command.status !== "in_progress") {
      res.status(202).json(command);
      return;
    }

    const input = readOutputChunkRequest(req.body);
    if (!input) {
      res.status(400).json({ error: "sequence, stream, and text are required" });
      return;
    }

    await this.outputStorage.appendChunk({
      workerId: worker.workerId,
      transactionId: command.transactionId,
      sequence: input.sequence,
      stream: input.stream,
      text: input.text,
      emittedAt: input.emittedAt ?? new Date().toISOString(),
    });
    res.status(202).json({ ok: true });
  });

  public readonly completeTask: RequestHandler = asyncHandler(async (req, res) => {
    const worker = await requireWorkerBearerToken(this.tokens, req.headers.authorization, res);
    if (!worker) return;

    const command = await this.requireWorkerCommand(worker.workerId, req.params.transactionId, res);
    if (!command) return;
    const input = readTaskCompleteRequest(req.body);

    let errorMessage = input.errorMessage;
    if (this.outputStorage && command.status === "in_progress") {
      try {
        const outputMetadata = await this.outputStorage.completeCommand(worker.workerId, command.transactionId);
        if (outputMetadata) {
          await this.workers.recordWorkerCommandOutputMetadata({
            transactionId: command.transactionId,
            workerId: worker.workerId,
            ...outputMetadata,
          });
        }
      } catch (error) {
        const storageError = `command output storage failed: ${error instanceof Error ? error.message : String(error)}`;
        errorMessage = errorMessage ? `${errorMessage}; ${storageError}` : storageError;
      }
    }

    const result = input.result ?? null;
    const completed = await this.workers.completeWorkerCommand({
      transactionId: command.transactionId,
      workerId: worker.workerId,
      result,
      agentResponse: result ? extractAgentResponse(command.commandMode, result) : null,
      errorMessage,
    });
    await this.lifecycle?.commandCompleted(completed);
    res.json(completed);
  });

  public readonly rejectTask: RequestHandler = asyncHandler(async (req, res) => {
    const worker = await requireWorkerBearerToken(this.tokens, req.headers.authorization, res);
    if (!worker) return;

    const command = await this.requireWorkerCommand(worker.workerId, req.params.transactionId, res);
    if (!command) return;

    const completed = await this.workers.completeWorkerCommand({
      transactionId: command.transactionId,
      workerId: worker.workerId,
      result: null,
      agentResponse: null,
      errorMessage: readCleanString((req.body as Record<string, unknown> | undefined)?.reason) ?? "worker rejected command",
    });
    await this.lifecycle?.commandCompleted(completed);
    res.json(completed);
  });

  public readonly claimJiraTicket: RequestHandler = asyncHandler(async (req, res) => {
    if (!this.jiraTicketClaims) {
      res.status(503).json({ error: "Jira ticket claiming is not configured" });
      return;
    }

    const worker = await requireWorkerBearerToken(this.tokens, req.headers.authorization, res);
    if (!worker) return;

    const input = readJiraClaimRequest(req.body);
    if (!input) {
      res.status(400).json({
        error: "integrationId, sourceItemId, sourceItemKey, sourceItemUrl, repositoryUrl, normalizedRepositoryUrl, and command are required",
      });
      return;
    }
    const integration = await this.jiraIntegrations?.getSettings(
      worker.userId,
      input.integrationId,
      worker.workerId,
    );
    if (this.jiraIntegrations && !integration) {
      res.status(403).json({ error: "Jira integration does not belong to this worker" });
      return;
    }

    const result = await this.jiraTicketClaims.claim({
      workerId: worker.workerId,
      userId: worker.userId,
      integrationId: input.integrationId,
      sourceItemId: input.sourceItemId,
      sourceItemKey: input.sourceItemKey,
      sourceItemUrl: input.sourceItemUrl,
      ...(input.sourceAssigneeAccountId ? { sourceAssigneeAccountId: input.sourceAssigneeAccountId } : {}),
      repositoryUrl: input.repositoryUrl,
      normalizedRepositoryUrl: input.normalizedRepositoryUrl,
      command: input.command,
      metadata: input.metadata,
    });

    if (!result.claimed) {
      res.status(409).json({
        claimed: false,
        ...(result.reason ? { reason: result.reason } : {}),
        event: result.event
          ? {
              id: result.event.id,
              status: result.event.status,
              workerId: result.event.workerId,
              transactionId: result.event.transactionId,
            }
          : undefined,
      });
      return;
    }

    await this.lifecycle?.commandStarted(result.command);
    res.status(201).json({
      claimed: true,
      transactionId: result.command.transactionId,
      eventId: result.event.id,
      command: result.command,
    });
  });

  private async requireWorkerCommand(workerId: string, transactionId: string, res: Parameters<RequestHandler>[1]): Promise<Command | undefined> {
    const command = await this.workers.getWorkerCommand(transactionId);
    if (!command || command.workerId !== workerId) {
      res.status(404).json({ error: "command not found" });
      return undefined;
    }

    return command;
  }
}

export function createWorkerAuthController(
  tenants: AppStore,
  workers: WorkerStore,
  tokens: WorkerTokenService,
  apiToWorkerTokens: ApiToWorkerTokenIssuer,
  workerConfigEncryptionKey: string,
  outputStorage?: CommandOutputStorage,
  gitRepositories?: GitRepositoryStore,
  jiraIntegrations?: JiraIntegrationStore,
  jiraTicketClaims?: JiraTicketClaimStore,
  lifecycle?: IntegrationLifecycleService
): WorkerAuthController {
  return new WorkerAuthController(
    tenants,
    workers,
    tokens,
    apiToWorkerTokens,
    workerConfigEncryptionKey,
    outputStorage,
    gitRepositories,
    jiraIntegrations,
    jiraTicketClaims,
    lifecycle
  );
}

const workerHeartbeatTimeoutSeconds = 150;

type WorkerRegistrationRequest = {
  workerId: string;
  paths: string[];
  skills: string[];
  enabledTaskTypes: CommandMode[];
  maxConcurrentTasks: number | null;
  gitRepositories: WorkerGitRepositoryInput[];
  jiraIntegrations: WorkerJiraIntegrationInput[];
};

type TaskStartRequest = {
  command: string;
  executionCommand?: string;
  commandMode: CommandMode;
  repositoryUrl?: string;
  normalizedRepositoryUrl?: string;
  provider?: string;
  integrationId?: string;
  sourceItemId?: string;
  sourceItemKey?: string;
  sourceItemUrl?: string;
  sourceAssigneeAccountId?: string;
  metadata?: Record<string, unknown>;
};

function readWorkerRegistrationRequest(value: unknown): WorkerRegistrationRequest | undefined {
  if (!value || typeof value !== "object") return undefined;
  const body = value as Record<string, unknown>;
  const workerId = readCleanString(body.workerId);
  if (!workerId) return undefined;

  return {
    workerId,
    paths: readStringArray(body.paths),
    skills: readStringArray(body.skills).map((skill) => skill.toLowerCase()),
    enabledTaskTypes: normalizeEnabledTaskTypes(body.enabledTaskTypes),
    maxConcurrentTasks: normalizeMaxConcurrentTasks(body.maxConcurrentTasks),
    gitRepositories: readWorkerRepositories(body.gitRepositories),
    jiraIntegrations: readWorkerJiraIntegrations(body.jiraIntegrations),
  };
}

function readTaskStartRequest(value: unknown): TaskStartRequest | undefined {
  if (!value || typeof value !== "object") return undefined;
  const body = value as Record<string, unknown>;
  const command = readCleanString(body.command);
  const commandMode = readCommandMode(body.commandMode);
  if (!command || !commandMode) return undefined;

  const repositoryUrl = readCleanString(body.repositoryUrl);
  return {
    command,
    commandMode,
    executionCommand: readCleanString(body.executionCommand),
    repositoryUrl,
    normalizedRepositoryUrl: readCleanString(body.normalizedRepositoryUrl) ?? (repositoryUrl ? normalizeRepositoryUrl(repositoryUrl) : undefined),
    provider: readCleanString(body.provider)?.toLowerCase(),
    integrationId: readCleanString(body.integrationId),
    sourceItemId: readCleanString(body.sourceItemId),
    sourceItemKey: readCleanString(body.sourceItemKey),
    sourceItemUrl: readCleanString(body.sourceItemUrl),
    sourceAssigneeAccountId: readCleanString(body.sourceAssigneeAccountId),
    metadata: readPlainObject(body.metadata),
  };
}

function readCommandMode(value: unknown): CommandMode | undefined {
  const mode = readCleanString(value)?.toLowerCase();
  if (mode === "gitflow") return mode;
  return undefined;
}

function readOutputChunkRequest(value: unknown): { sequence: number; stream: "stdout" | "stderr"; text: string; emittedAt?: string } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const body = value as Record<string, unknown>;
  const sequence = typeof body.sequence === "number" && Number.isFinite(body.sequence) ? body.sequence : undefined;
  const stream = body.stream === "stderr" ? "stderr" : body.stream === "stdout" ? "stdout" : undefined;
  const text = typeof body.text === "string" ? body.text : undefined;
  if (sequence === undefined || !stream || text === undefined) return undefined;

  return {
    sequence,
    stream,
    text,
    emittedAt: readCleanString(body.emittedAt),
  };
}

function readTaskCompleteRequest(value: unknown): { result?: string | null; errorMessage: string | null } {
  if (!value || typeof value !== "object") return { errorMessage: null };
  const body = value as Record<string, unknown>;
  const rawResult = body.result;
  return {
    result: typeof rawResult === "string" ? rawResult : rawResult === null ? null : undefined,
    errorMessage: readCleanString(body.errorMessage) ?? null,
  };
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split("|").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function readWorkerRepositories(value: unknown): WorkerGitRepositoryInput[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): WorkerGitRepositoryInput | undefined => {
      if (!item || typeof item !== "object") return undefined;
      const payload = item as Record<string, unknown>;
      const repositoryUrl = readCleanString(payload.repositoryUrl ?? payload.RepositoryUrl);
      const sourceBranch = readCleanString(payload.sourceBranch ?? payload.SourceBranch);
      const targetBranch = readCleanString(payload.targetBranch ?? payload.TargetBranch);
      if (!repositoryUrl || !sourceBranch || !targetBranch) return undefined;
      return {
        repositoryUrl,
        normalizedRepositoryUrl: readCleanString(payload.normalizedRepositoryUrl ?? payload.NormalizedRepositoryUrl) ?? normalizeRepositoryUrl(repositoryUrl),
        sourceBranch,
        targetBranch,
      };
    })
    .filter((item): item is WorkerGitRepositoryInput => Boolean(item));
}

function readWorkerJiraIntegrations(value: unknown): WorkerJiraIntegrationInput[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): WorkerJiraIntegrationInput | undefined => {
      if (!item || typeof item !== "object") return undefined;
      const payload = item as Record<string, unknown>;
      const integrationId = readCleanString(payload.integrationId ?? payload.IntegrationId);
      const siteUrl = readCleanString(payload.siteUrl ?? payload.SiteUrl);
      const email = readCleanString(payload.email ?? payload.Email);
      const apiToken = readCleanString(payload.apiToken ?? payload.ApiToken);
      const boardId = readInteger(payload.boardId ?? payload.BoardId);
      const boardName = readCleanString(payload.boardName ?? payload.BoardName);
      const boardType = readCleanString(payload.boardType ?? payload.BoardType);
      const readyStatusId = readCleanString(payload.readyStatusId ?? payload.ReadyStatusId);
      const readyStatusName = readCleanString(payload.readyStatusName ?? payload.ReadyStatusName);
      const processingStatusId = readCleanString(payload.processingStatusId ?? payload.ProcessingStatusId);
      const processingStatusName = readCleanString(payload.processingStatusName ?? payload.ProcessingStatusName);
      const processedStatusId = readCleanString(payload.processedStatusId ?? payload.ProcessedStatusId);
      const processedStatusName = readCleanString(payload.processedStatusName ?? payload.ProcessedStatusName);
      if (!integrationId || !siteUrl || !email || !apiToken || !boardId || !boardName || !boardType || !readyStatusId || !readyStatusName || !processingStatusId || !processingStatusName || !processedStatusId || !processedStatusName) {
        return undefined;
      }
      return {
        integrationId,
        enabled: readBoolean(payload.enabled ?? payload.Enabled),
        siteUrl,
        email,
        boardId,
        boardName,
        boardType,
        boardFilterId: readInteger(payload.boardFilterId ?? payload.BoardFilterId),
        readyStatusId,
        readyStatusName,
        processingStatusId,
        processingStatusName,
        processedStatusId,
        processedStatusName,
        assignees: readJiraAssignees(payload.assignees ?? payload.Assignees),
      };
    })
    .filter((item): item is WorkerJiraIntegrationInput => Boolean(item));
}

function readInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return undefined;
}

function readBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "yes", "1"].includes(value.trim().toLowerCase());
  return false;
}

function extractAgentResponse(commandMode: string, result: string): string {
  if (commandMode !== "gitflow") return result.trim();
  const marker = "AI summary:";
  const markerIndex = result.indexOf(marker);
  if (markerIndex < 0) return result.trim();
  return result.slice(markerIndex + marker.length).trim();
}

type JiraClaimRequest = {
  integrationId: string;
  sourceItemId: string;
  sourceItemKey: string;
  sourceItemUrl: string;
  sourceAssigneeAccountId?: string;
  repositoryUrl: string;
  normalizedRepositoryUrl: string;
  command: string;
  metadata?: Record<string, unknown>;
};

function readJiraClaimRequest(value: unknown): JiraClaimRequest | undefined {
  if (!value || typeof value !== "object") return undefined;
  const body = value as Record<string, unknown>;
  const input = {
    integrationId: readCleanString(body.integrationId),
    sourceItemId: readCleanString(body.sourceItemId),
    sourceItemKey: readCleanString(body.sourceItemKey),
    sourceItemUrl: readCleanString(body.sourceItemUrl),
    sourceAssigneeAccountId: readCleanString(body.sourceAssigneeAccountId),
    repositoryUrl: readCleanString(body.repositoryUrl),
    normalizedRepositoryUrl: readCleanString(body.normalizedRepositoryUrl),
    command: readCleanString(body.command),
    metadata: readPlainObject(body.metadata),
  };

  if (
    !input.integrationId ||
    !input.sourceItemId ||
    !input.sourceItemKey ||
    !input.sourceItemUrl ||
    !input.repositoryUrl ||
    !input.normalizedRepositoryUrl ||
    !input.command
  ) {
    return undefined;
  }

  return input as JiraClaimRequest;
}

function readJiraAssignees(value: unknown): { accountId: string; displayName: string; emailAddress: string }[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return undefined;
      const payload = item as Record<string, unknown>;
      const accountId = readCleanString(payload.accountId ?? payload.AccountId);
      if (!accountId) return undefined;
      return {
        accountId,
        displayName: readCleanString(payload.displayName ?? payload.DisplayName) ?? "",
        emailAddress: readCleanString(payload.emailAddress ?? payload.EmailAddress) ?? "",
      };
    })
    .filter((item): item is { accountId: string; displayName: string; emailAddress: string } => Boolean(item));
}
