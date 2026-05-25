import { Router } from "express";
import { ApiToWorkerTokenIssuer, WorkerTokenService } from "../auth/workerTokens.js";
import { createWorkerAuthController } from "../controllers/workerAuth/workerAuthController.js";
import { IntegrationIntakeEventStore } from "../store/integrations/integrationIntakeEventStore.js";
import { JiraIntegrationStore } from "../store/integrations/jiraIntegrationStore.js";
import { AppStore } from "../store/tenantStore.js";

export function createWorkerAuthRoutes(
  tenants: AppStore,
  tokens: WorkerTokenService,
  apiToWorkerTokens: ApiToWorkerTokenIssuer,
  workerConfigEncryptionKey: string,
  intakeEvents?: IntegrationIntakeEventStore,
  jiraIntegrations?: JiraIntegrationStore
): Router {
  const router = Router();
  const controller = createWorkerAuthController(
    tenants,
    tokens,
    apiToWorkerTokens,
    workerConfigEncryptionKey,
    intakeEvents,
    jiraIntegrations
  );

  router.post("/token", controller.issueToken);
  router.post("/refresh", controller.refreshToken);
  router.get("/public-key", controller.publicKey);
  router.get("/jira-attachments/:eventId/:attachmentId", controller.downloadJiraAttachment);

  return router;
}
