import { Router } from "express";
import { requireJwt } from "../auth/requireJwt.js";
import { ApiToWorkerTokenIssuer, WorkerTokenService } from "../auth/workerTokens.js";
import { createWorkerAuthController } from "../controllers/workerAuth/workerAuthController.js";
import { IntegrationLifecycleService } from "../integrations/integrationLifecycleService.js";
import { IntegrationIntakeEventStore } from "../store/integrations/integrationIntakeEventStore.js";
import { JiraIntegrationStore } from "../store/integrations/jiraIntegrationStore.js";
import { JiraTicketClaimStore } from "../store/integrations/jiraTicketClaimStore.js";
import { AppStore } from "../store/tenantStore.js";

export function createWorkerAuthRoutes(
  tenants: AppStore,
  tokens: WorkerTokenService,
  apiToWorkerTokens: ApiToWorkerTokenIssuer,
  workerConfigEncryptionKey: string,
  intakeEvents?: IntegrationIntakeEventStore,
  jiraIntegrations?: JiraIntegrationStore,
  jiraTicketClaims?: JiraTicketClaimStore,
  lifecycle?: IntegrationLifecycleService
): Router {
  const router = Router();
  const controller = createWorkerAuthController(
    tenants,
    tokens,
    apiToWorkerTokens,
    workerConfigEncryptionKey,
    intakeEvents,
    jiraIntegrations,
    jiraTicketClaims,
    lifecycle
  );

  router.post("/token", requireJwt, controller.issueToken);
  router.post("/refresh", controller.refreshToken);
  router.get("/public-key", controller.publicKey);
  router.get("/jira-attachments/:eventId/:attachmentId", controller.downloadJiraAttachment);
  router.post("/integration-tickets/jira/claim", controller.claimJiraTicket);

  return router;
}
