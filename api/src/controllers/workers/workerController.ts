import { RequestHandler } from "express";
import { CommandOutputStorage } from "../../storage/commandOutputStorage.js";
import { WorkerStore } from "../../store/clientStore.js";
import { GitRepositoryStore } from "../../store/gitRepositories/gitRepositoryStore.js";
import { Command, User } from "../../types.js";
import { isTaskTypeEnabled } from "../../commandModes.js";
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

  public readonly listWorkers: RequestHandler = async (req, res, next) => {
    try {
      const user = req.user as User;
      res.json(await this.store.listWorkersForUser(user.userId));
    } catch (error) {
      next(error);
    }
  };

  public readonly getWorkerState: RequestHandler = async (req, res, next) => {
    try {
      const user = req.user as User;
      const client = await this.store.getWorkerForUser(user.userId, req.params.workerId);
      if (!client) {
        return res.status(404).json({ error: "worker is not registered" });
      }

      res.json(toWorkerStateResponse(client));
    } catch (error) {
      next(error);
    }
  };

  public readonly updateWorker: RequestHandler = async (req, res, next) => {
    try {
      const user = req.user as User;
      const enabled = readWorkerEnabled(req.body);
      if (enabled === undefined) {
        return res.status(400).json({ error: "enabled must be a boolean" });
      }

      const client = await this.store.setWorkerEnabledForUser(user.userId, req.params.workerId, enabled);
      if (!client) {
        return res.status(404).json({ error: "worker is not registered" });
      }

      if (enabled) {
        await (this.dispatcher.dispatchQueuedCommands?.(client.workerId) ?? Promise.resolve());
      }

      res.json(toWorkerStateResponse(client));
    } catch (error) {
      next(error);
    }
  };

  public readonly disableAllWorkers: RequestHandler = async (req, res, next) => {
    try {
      const user = req.user as User;
      res.json(await this.store.disableWorkersForUser(user.userId));
    } catch (error) {
      next(error);
    }
  };

  public readonly listWorkerCommands: RequestHandler = async (req, res, next) => {
    try {
      const user = req.user as User;
      const client = await this.store.getWorkerForUser(user.userId, req.params.workerId);
      if (!client) {
        return res.status(404).json({ error: "worker is not registered" });
      }

      res.json(await this.store.listWorkerCommands(client.workerId, readCommandPagination(req.query)));
    } catch (error) {
      next(error);
    }
  };

  public readonly listTaskQueue: RequestHandler = async (req, res, next) => {
    try {
      const user = req.user as User;
      res.json(await this.store.listTaskQueueForUser(user.userId, {
        ...readCommandPagination(req.query),
        statuses: readTaskQueueStatuses(req.query),
        ...readTaskQueueSort(req.query)
      }));
    } catch (error) {
      next(error);
    }
  };

  public readonly listGitflowSuggestions: RequestHandler = async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: "authentication required" });
      }

      const client = await this.store.getWorkerForUser(user.userId, req.params.workerId);
      if (!client) {
        return res.status(404).json({ error: "worker is not registered" });
      }

      res.json({
        repositories: this.gitRepositories
          ? await this.gitRepositories.listGitflowSuggestions(user.userId, client.workerId)
          : []
      });
    } catch (error) {
      next(error);
    }
  };

  public readonly createWorkerCommand: RequestHandler = async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: "authentication required" });
      }

      const client = await this.store.getWorkerForUser(user.userId, req.params.workerId);
      if (!client) {
        return res.status(404).json({ error: "worker is not registered" });
      }

      const { command, commandMode } = req.body as { command?: string; commandMode?: string };
      if (!command) {
        return res.status(400).json({ error: "command is required" });
      }

      const parsedCommandMode = parseCommandMode(commandMode);
      if (!parsedCommandMode) {
        return res.status(400).json({ error: "commandMode must be ai, shell, or gitflow" });
      }
      if (!isTaskTypeEnabled(client.enabledTaskTypes, parsedCommandMode)) {
        return res.status(400).json({ error: `worker is not enabled for commandMode ${parsedCommandMode}` });
      }

      const missingSkills = getMissingSkills(client.skills, parsedCommandMode);
      if (missingSkills.length > 0) {
        return res.status(400).json({ error: `commandMode ${parsedCommandMode} requires worker skill(s): ${missingSkills.join(", ")}` });
      }

      if (parsedCommandMode === "gitflow") {
        const payload = parseGitflowPayload(command);
        if (!payload) {
          return res.status(400).json({ error: "gitflow command must be valid JSON with repositoryUrl and sourceBranch" });
        }

        await this.gitRepositories?.recordGitflowUsage({
          userId: user.userId,
          workerId: client.workerId,
          repositoryUrl: payload.repositoryUrl,
          sourceBranch: payload.sourceBranch
        });
      }

      const queued = await this.store.createWorkerCommand(user.userId, client.workerId, command, parsedCommandMode);
      await this.dispatcher.dispatchCommand(client.workerId, queued.transactionId, { allowDisabledWorker: true });

      res.status(202).json(queued);
    } catch (error) {
      next(error);
    }
  };

  public readonly getWorkerCommand: RequestHandler = async (req, res, next) => {
    try {
      const command = await this.getVisibleCommand(req.user as User, req.params.workerId, req.params.transactionId);
      if (!command) return res.status(404).json({ error: "command not found" });
      res.json(command);
    } catch (error) {
      next(error);
    }
  };

  public readonly cancelWorkerCommand: RequestHandler = async (req, res, next) => {
    try {
      const command = await this.getVisibleCommand(req.user as User, req.params.workerId, req.params.transactionId);
      if (!command) return res.status(404).json({ error: "command not found" });

      const cancelled = await this.store.cancelWorkerCommand({
        transactionId: command.transactionId,
        workerId: req.params.workerId,
        reason: readCancelReason(req.body)
      });

      await (this.dispatcher.dispatchQueuedCommands?.(req.params.workerId) ?? Promise.resolve());
      res.json(cancelled);
    } catch (error) {
      next(error);
    }
  };

  public readonly streamWorkerCommandOutput: RequestHandler = async (req, res, next) => {
    try {
      const command = await this.getVisibleCommand(req.user as User, req.params.workerId, req.params.transactionId);
      if (!command) return res.status(404).json({ error: "command not found" });
      await streamCommandOutput(command, res, this.outputStorage);
    } catch (error) {
      next(error);
    }
  };

  public readonly getWorkerCommandResponses: RequestHandler = async (req, res, next) => {
    try {
      const command = await this.getVisibleCommand(req.user as User, req.params.workerId, req.params.transactionId);
      if (!command) return res.status(404).json({ error: "command not found" });
      await sendCommandResponses(command, res, this.outputStorage);
    } catch (error) {
      next(error);
    }
  };

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
