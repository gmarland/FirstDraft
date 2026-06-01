import { RequestHandler } from "express";
import { CommandOutputStorage } from "../../storage/commandOutputStorage.js";
import { WorkerStore } from "../../store/clientStore.js";
import { GitRepositoryStore } from "../../store/gitRepositories/gitRepositoryStore.js";
import { JiraIntegrationStore } from "../../store/integrations/jiraIntegrationStore.js";
import { Command, User } from "../../types.js";
import { asyncHandler, readRouteParam, requireUser, requireWorkerForUser } from "../controllerHelpers.js";
import { readTaskQueueSort, readTaskQueueStatuses } from "./workerRequests.js";
import { sendCommandResponses, streamCommandOutput, toWorkerStateResponse } from "./workerResponses.js";

const DEFAULT_COMMAND_PAGE = 0;
const DEFAULT_COMMAND_PAGE_SIZE = 10;
const ALLOWED_COMMAND_PAGE_SIZES = [5, 10, 25, 50];

export class WorkerController {
  public constructor(
    private readonly store: WorkerStore,
    private readonly outputStorage?: CommandOutputStorage,
    private readonly gitRepositories?: GitRepositoryStore,
    private readonly jiraIntegrations?: JiraIntegrationStore
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

    const [gitRepositories, jiraIntegrations] = await Promise.all([
      this.gitRepositories?.listGitflowSuggestions(client.workerId) ?? Promise.resolve([]),
      this.jiraIntegrations?.listWorkerSettings(user.userId, client.workerId) ?? Promise.resolve([])
    ]);

    res.json(toWorkerStateResponse(client, gitRepositories, jiraIntegrations));
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

  public readonly getWorkerCommand: RequestHandler = asyncHandler(async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;

    const command = await this.getVisibleCommand(
      user,
      readRouteParam(req.params.workerId),
      readRouteParam(req.params.transactionId)
    );
    if (!command) {
      res.status(404).json({ error: "command not found" });
      return;
    }

    res.json(command);
  });

  public readonly streamWorkerCommandOutput: RequestHandler = asyncHandler(async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;

    const command = await this.getVisibleCommand(
      user,
      readRouteParam(req.params.workerId),
      readRouteParam(req.params.transactionId)
    );
    if (!command) {
      res.status(404).json({ error: "command not found" });
      return;
    }

    await streamCommandOutput(command, res, this.outputStorage);
  });

  public readonly getWorkerCommandResponses: RequestHandler = asyncHandler(async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;

    const command = await this.getVisibleCommand(
      user,
      readRouteParam(req.params.workerId),
      readRouteParam(req.params.transactionId)
    );
    if (!command) {
      res.status(404).json({ error: "command not found" });
      return;
    }

    await sendCommandResponses(command, res, this.outputStorage);
  });

  private async getVisibleCommand(
    user: User,
    workerId: string | undefined,
    transactionId: string | undefined
  ): Promise<Command | undefined> {
    if (!workerId || !transactionId) return undefined;

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
  outputStorage?: CommandOutputStorage,
  gitRepositories?: GitRepositoryStore,
  jiraIntegrations?: JiraIntegrationStore
): WorkerController {
  return new WorkerController(store, outputStorage, gitRepositories, jiraIntegrations);
}
