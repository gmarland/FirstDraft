import { Router } from "express";
import { createWorkerController } from "../controllers/workers/workerController.js";
import { CommandOutputStorage } from "../storage/commandOutputStorage.js";
import { WorkerStore } from "../store/clientStore.js";
import { GitRepositoryStore } from "../store/gitRepositories/gitRepositoryStore.js";

type CommandDispatcher = {
  dispatchCommand(workerId: string, transactionId: string): Promise<void>;
  dispatchQueuedCommands?(workerId?: string): Promise<void>;
};

export function createWorkerRoutes(
  store: WorkerStore,
  dispatcher: CommandDispatcher,
  outputStorage?: CommandOutputStorage,
  gitRepositories?: GitRepositoryStore
): Router {
  const router = Router();
  const controller = createWorkerController(store, dispatcher, outputStorage, gitRepositories);

  router.get("/", controller.listWorkers);
  router.post("/disable-all", controller.disableAllWorkers);
  router.patch("/:workerId", controller.updateWorker);
  router.get("/:workerId/state", controller.getWorkerState);
  router.get("/:workerId/commands", controller.listWorkerCommands);
  router.get("/:workerId/gitflow-suggestions", controller.listGitflowSuggestions);
  router.post("/:workerId/commands", controller.createWorkerCommand);
  router.get("/:workerId/commands/:transactionId", controller.getWorkerCommand);
  router.post("/:workerId/commands/:transactionId/cancel", controller.cancelWorkerCommand);
  router.get("/:workerId/commands/:transactionId/output", controller.streamWorkerCommandOutput);
  router.get("/:workerId/commands/:transactionId/responses", controller.getWorkerCommandResponses);

  return router;
}
