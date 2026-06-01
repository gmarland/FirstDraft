import { RequestHandler } from "express";
import { CommandOutputStorage } from "../../storage/commandOutputStorage.js";
import { WorkerStore } from "../../store/clientStore.js";
import { GitRepositoryStore, normalizeRepositoryUrl } from "../../store/gitRepositories/gitRepositoryStore.js";
import { Command, User } from "../../types.js";
import { isTaskTypeEnabled } from "../../commandModes.js";
import { asyncHandler, requireUser, requireWorkerForUser } from "../controllerHelpers.js";
import { getMissingSkills, parseCommandMode, parseGitflowPayload, readCancelReason, readTaskQueueSort, readTaskQueueStatuses, readWorkerEnabled } from "./workerRequests.js";
import { sendCommandResponses, streamCommandOutput, toWorkerStateResponse } from "./workerResponses.js";

const DEFAULT_COMMAND_PAGE = 0;
const DEFAULT_COMMAND_PAGE_SIZE = 10;
const ALLOWED_COMMAND_PAGE_SIZES = [5, 10, 25, 50];

type CommandDispatcher = {
  dispatchCommand(workerId: string, transactionId: string, options?: { allowDisabledWorker?: boolean }): Promise<void>;
  dispatchQueuedCommands?(workerId?: string): Promise<void>;
};

export class WorkerController {
  public constructor(
    private readonly store: WorkerStore,
    private readonly dispatcher: CommandDispatcher,
    private readonly outputStorage?: CommandOutputStorage,
    private readonly gitRepositories?: GitRepositoryStore
  ) {}

  public readonly listWorkers: RequestHandler = asyncHandler(async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;

    res.json(await this.store.listWorkersForUser(user.userId));
  });

  public readonly getWorkerState: RequestHandler = asyncHandler(async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;

    const client = await requireWorkerForUser(this.store, user, req.params.workerId, res);
    if (!client) return;

    res.json(toWorkerStateResponse(client));
  });

  public readonly updateWorker: RequestHandler = asyncHandler(async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;

    const enabled = readWorkerEnabled(req.body);
    if (enabled === undefined) {
      res.status(400).json({ error: "enabled must be a boolean" });
      return;
    }

    const client = await this.store.setWorkerEnabledForUser(user.userId, req.params.workerId, enabled);
    if (!client) {
      res.status(404).json({ error: "worker is not registered" });
      return;
    }

    if (enabled) {
      await (this.dispatcher.dispatchQueuedCommands?.(client.workerId) ?? Promise.resolve());
    }

    res.json(toWorkerStateResponse(client));
  });

  public readonly disableAllWorkers: RequestHandler = asyncHandler(async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;

    res.json(await this.store.disableWorkersForUser(user.userId));
  });

  public readonly listWorkerCommands: RequestHandler = asyncHandler(async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;

    const client = await requireWorkerForUser(this.store, user, req.params.workerId, res);
    if (!client) return;

    res.json(await this.store.listWorkerCommands(client.workerId, readCommandPagination(req.query)));
  });

  public readonly listTaskQueue: RequestHandler = asyncHandler(async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;

    res.json(await this.store.listTaskQueueForUser(user.userId, {
      ...readCommandPagination(req.query),
      statuses: readTaskQueueStatuses(req.query),
      ...readTaskQueueSort(req.query)
    }));
  });

  public readonly listGitflowSuggestions: RequestHandler = asyncHandler(async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;

    const client = await requireWorkerForUser(this.store, user, req.params.workerId, res);
    if (!client) return;

    res.json({
      repositories: this.gitRepositories
        ? await this.gitRepositories.listGitflowSuggestions(client.workerId)
        : []
    });
  });

  public readonly createWorkerCommand: RequestHandler = asyncHandler(async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;

    const client = await requireWorkerForUser(this.store, user, req.params.workerId, res);
    if (!client) return;

    const { command, commandMode } = req.body as { command?: string; commandMode?: string };
    if (!command) {
      res.status(400).json({ error: "command is required" });
      return;
    }

    const parsedCommandMode = parseCommandMode(commandMode);
    if (!parsedCommandMode) {
      res.status(400).json({ error: "commandMode must be ai, shell, or gitflow" });
      return;
    }
    if (!isTaskTypeEnabled(client.enabledTaskTypes, parsedCommandMode)) {
      res.status(400).json({ error: `worker is not enabled for commandMode ${parsedCommandMode}` });
      return;
    }

    const missingSkills = getMissingSkills(client.skills, parsedCommandMode);
    if (missingSkills.length > 0) {
      res.status(400).json({ error: `commandMode ${parsedCommandMode} requires worker skill(s): ${missingSkills.join(", ")}` });
      return;
    }

    const gitflowPayload = parsedCommandMode === "gitflow" ? parseGitflowPayload(command) : undefined;
    if (parsedCommandMode === "gitflow") {
      const payload = gitflowPayload;
      if (!payload) {
        res.status(400).json({ error: "gitflow command must be valid JSON with repositoryUrl and sourceBranch" });
        return;
      }

      const repository = await this.gitRepositories?.getWorkerRepository(client.workerId, payload.repositoryUrl);
      if (!repository) {
        res.status(400).json({ error: "worker is not configured for this gitflow repository" });
        return;
      }

      if (payload.sourceBranch !== repository.sourceBranch || (payload.targetBranch ?? payload.sourceBranch) !== repository.targetBranch) {
        res.status(400).json({ error: "gitflow sourceBranch and targetBranch must match the worker repository configuration" });
        return;
      }

      await this.gitRepositories?.touchWorkerRepository(client.workerId, payload.repositoryUrl);
    }

    const queued = await this.store.createQueuedCommand({
      userId: user.userId,
      workerId: client.workerId,
      command,
      commandMode: parsedCommandMode,
      repositoryUrl: gitflowPayload?.repositoryUrl,
      normalizedRepositoryUrl: gitflowPayload ? normalizeRepositoryUrl(gitflowPayload.repositoryUrl) : undefined
    });
    await this.dispatcher.dispatchCommand(client.workerId, queued.transactionId, { allowDisabledWorker: true });

    res.status(202).json(queued);
  });

  public readonly getWorkerCommand: RequestHandler = asyncHandler(async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;

    const command = await this.getVisibleCommand(user, req.params.workerId, req.params.transactionId);
    if (!command) {
      res.status(404).json({ error: "command not found" });
      return;
    }

    res.json(command);
  });

  public readonly cancelWorkerCommand: RequestHandler = asyncHandler(async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;

    const command = await this.getVisibleCommand(user, req.params.workerId, req.params.transactionId);
    if (!command) {
      res.status(404).json({ error: "command not found" });
      return;
    }

    const cancelled = await this.store.cancelWorkerCommand({
      transactionId: command.transactionId,
      workerId: req.params.workerId,
      reason: readCancelReason(req.body)
    });

    await (this.dispatcher.dispatchQueuedCommands?.(req.params.workerId) ?? Promise.resolve());
    res.json(cancelled);
  });

  public readonly streamWorkerCommandOutput: RequestHandler = asyncHandler(async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;

    const command = await this.getVisibleCommand(user, req.params.workerId, req.params.transactionId);
    if (!command) {
      res.status(404).json({ error: "command not found" });
      return;
    }

    await streamCommandOutput(command, res, this.outputStorage);
  });

  public readonly getWorkerCommandResponses: RequestHandler = asyncHandler(async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;

    const command = await this.getVisibleCommand(user, req.params.workerId, req.params.transactionId);
    if (!command) {
      res.status(404).json({ error: "command not found" });
      return;
    }

    await sendCommandResponses(command, res, this.outputStorage);
  });

  private async getVisibleCommand(user: User, workerId: string, transactionId: string): Promise<Command | undefined> {
    const client = await this.store.getWorkerForUser(user.userId, workerId);
    if (!client) return undefined;

    const command = await this.store.getWorkerCommand(transactionId);
    return command?.workerId === client.workerId ? command : undefined;
  }
}

function readCommandPagination(query: Record<string, unknown>): { page: number; pageSize: number } {
  const page = readNonNegativeInteger(query.page, DEFAULT_COMMAND_PAGE);
  const requestedPageSize = readNonNegativeInteger(query.pageSize, DEFAULT_COMMAND_PAGE_SIZE);
  const pageSize = ALLOWED_COMMAND_PAGE_SIZES.includes(requestedPageSize)
    ? requestedPageSize
    : DEFAULT_COMMAND_PAGE_SIZE;

  return { page, pageSize };
}

function readNonNegativeInteger(value: unknown, fallback: number): number {
  if (typeof value !== "string" || value.trim() === "") return fallback;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function createWorkerController(
  store: WorkerStore,
  dispatcher: CommandDispatcher,
  outputStorage?: CommandOutputStorage,
  gitRepositories?: GitRepositoryStore
): WorkerController {
  return new WorkerController(store, dispatcher, outputStorage, gitRepositories);
}
