import { Router } from "express";
import { createWorkerController } from "../controllers/workers/workerController.js";
import { CommandOutputStorage } from "../storage/commandOutputStorage.js";
import { WorkerStore } from "../store/clientStore.js";
import { GitRepositoryStore } from "../store/gitRepositories/gitRepositoryStore.js";

export function createWorkerRoutes(
  store: WorkerStore,
  outputStorage?: CommandOutputStorage,
  gitRepositories?: GitRepositoryStore
): Router {
  const router = Router();
  const controller = createWorkerController(store, outputStorage, gitRepositories);

  router.get("/", controller.listWorkers);
  router.get("/task-queue", controller.listTaskQueue);
  router.get("/:workerId/state", controller.getWorkerState);
  router.get("/:workerId/commands", controller.listWorkerCommands);
  router.get("/:workerId/commands/:transactionId", controller.getWorkerCommand);
  router.get("/:workerId/commands/:transactionId/output", controller.streamWorkerCommandOutput);
  router.get("/:workerId/commands/:transactionId/responses", controller.getWorkerCommandResponses);

  return router;
}
