import { Router } from "express";
import { createIntegrationController } from "../controllers/integrations/integrationController.js";
import { JiraIntakeService } from "../integrations/jira/jiraIntakeService.js";
import { JiraIntegrationStore } from "../store/integrations/jiraIntegrationStore.js";

export function createIntegrationRoutes(jiraIntegrations: JiraIntegrationStore, jiraIntake?: JiraIntakeService): Router {
  const router = Router();
  const controller = createIntegrationController(jiraIntegrations, jiraIntake);

  router.get("/", controller.listIntegrations);
  router.get("/jira", controller.listJiraIntegrations);
  router.post("/jira/intake", controller.runDefaultJiraIntake);
  router.post("/jira/test-connection", controller.testNewJiraConnection);
  router.get("/jira/:integrationId", controller.getJiraIntegration);
  router.put("/jira/connection", controller.createJiraConnection);
  router.put("/jira/:integrationId/connection", controller.updateJiraConnection);
  router.post("/jira/:integrationId/test-connection", controller.testJiraConnection);
  router.post("/jira/:integrationId/intake", controller.runJiraIntake);
  router.get("/jira/:integrationId/boards", controller.listJiraBoards);
  router.put("/jira/:integrationId/board", controller.saveJiraBoard);
  router.get("/jira/:integrationId/boards/:boardId/statuses", controller.listJiraBoardStatuses);
  router.put("/jira/:integrationId/ready-status", controller.saveJiraReadyStatus);
  router.put("/jira/:integrationId/workflow", controller.saveJiraWorkflow);
  router.put("/jira/:integrationId/enabled", controller.setJiraEnabled);
  router.get("/jira/:integrationId/ready-issues/sample", controller.sampleReadyJiraIssue);
  router.get("/jira/:integrationId/issues/:issueKey/transitions", controller.listJiraIssueTransitions);
  router.put("/jira/:integrationId/processed-status", controller.saveJiraProcessedStatus);
  router.put("/jira/:integrationId/processed-transition", controller.saveJiraProcessedTransition);
  router.put("/jira/:integrationId/settings", controller.saveJiraSettings);
  router.delete("/jira/:integrationId", controller.deleteJiraIntegration);
  router.post("/jira/:integrationId/test", controller.testJiraWorkflow);
  router.get("/jira/:integrationId/transitions/:issueKey", controller.listJiraTransitions);

  return router;
}
