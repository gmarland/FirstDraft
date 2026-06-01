import { Router } from "express";
import { requireJwt } from "../auth/requireJwt.js";
import { ApiToWorkerTokenIssuer, WorkerTokenService } from "../auth/workerTokens.js";
import { createWorkerAuthController } from "../controllers/workerAuth/workerAuthController.js";
import { IntegrationLifecycleService } from "../integrations/integrationLifecycleService.js";
import { CommandOutputStorage } from "../storage/commandOutputStorage.js";
import { WorkerStore } from "../store/clientStore.js";
import { GitRepositoryStore } from "../store/gitRepositories/gitRepositoryStore.js";
import { IntegrationIntakeEventStore } from "../store/integrations/integrationIntakeEventStore.js";
import { JiraIntegrationStore } from "../store/integrations/jiraIntegrationStore.js";
import { JiraTicketClaimStore } from "../store/integrations/jiraTicketClaimStore.js";
import { AppStore } from "../store/tenantStore.js";

export function createWorkerAuthRoutes(
  tenants: AppStore,
  workers: WorkerStore,
  tokens: WorkerTokenService,
  apiToWorkerTokens: ApiToWorkerTokenIssuer,
  workerConfigEncryptionKey: string,
  outputStorage?: CommandOutputStorage,
  intakeEvents?: IntegrationIntakeEventStore,
  gitRepositories?: GitRepositoryStore,
  jiraIntegrations?: JiraIntegrationStore,
  jiraTicketClaims?: JiraTicketClaimStore,
  lifecycle?: IntegrationLifecycleService
): Router {
  const router = Router();
  const controller = createWorkerAuthController(
    tenants,
    workers,
    tokens,
    apiToWorkerTokens,
    workerConfigEncryptionKey,
    outputStorage,
    intakeEvents,
    gitRepositories,
    jiraIntegrations,
    jiraTicketClaims,
    lifecycle
  );

  router.post("/token", requireJwt, controller.issueToken);
  router.post("/refresh", controller.refreshToken);
  router.get("/public-key", controller.publicKey);
  router.post("/register", controller.registerWorker);
  router.post("/heartbeat", controller.heartbeat);
  router.post("/tasks/start", controller.startTask);
  router.post("/tasks/:transactionId/output", controller.recordTaskOutput);
  router.post("/tasks/:transactionId/complete", controller.completeTask);
  router.post("/tasks/:transactionId/reject", controller.rejectTask);
  router.get("/jira-attachments/:eventId/:attachmentId", controller.downloadJiraAttachment);

  return router;
}
