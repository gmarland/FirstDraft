import { Router } from "express";
import { createWorkerController } from "../controllers/workers/workerController.js";
import { CommandOutputStorage } from "../storage/commandOutputStorage.js";
import { WorkerStore } from "../store/clientStore.js";
import { GitRepositoryStore } from "../store/gitRepositories/gitRepositoryStore.js";
import { JiraIntegrationStore } from "../store/integrations/jiraIntegrationStore.js";

export function createWorkerRoutes(
  store: WorkerStore,
  outputStorage?: CommandOutputStorage,
  gitRepositories?: GitRepositoryStore,
  jiraIntegrations?: JiraIntegrationStore,
  sharedWorkerVisibility = false
): Router {
  const router = Router();
  const controller = createWorkerController(store, outputStorage, gitRepositories, jiraIntegrations, sharedWorkerVisibility);

  router.get("/", controller.listWorkers);
  router.get("/task-queue", controller.listTaskQueue);
  router.get("/:workerId/state", controller.getWorkerState);
  router.get("/:workerId/commands", controller.listWorkerCommands);
  router.get("/:workerId/commands/:transactionId", controller.getWorkerCommand);
  router.get("/:workerId/commands/:transactionId/output", controller.streamWorkerCommandOutput);
  router.get("/:workerId/commands/:transactionId/responses", controller.getWorkerCommandResponses);

  return router;
}
