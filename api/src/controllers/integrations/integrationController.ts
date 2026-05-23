import { RequestHandler } from "express";
import { JiraClient } from "../../integrations/jira/jiraClient.js";
import { JiraIntakeService } from "../../integrations/jira/jiraIntakeService.js";
import { JiraIntegrationStore } from "../../store/integrations/jiraIntegrationStore.js";
import { User } from "../../types.js";
import {
  hasCompleteWorkflow,
  parseBoardInput,
  parseConnectionInput,
  parseJiraIntakeInput,
  parseProcessedStatusInput,
  parseReadyStatusInput,
  parseWorkflowInput,
  readEnabled,
  validateBoardInput,
  validateConnectionInput,
  validateProcessedStatusInput,
  validateReadyStatusInput,
  validateWorkflowInput
} from "./integrationRequests.js";
import { buildReadyJql, getClient, logJiraIntakeRequest } from "./integrationResponses.js";

export class IntegrationController {
  public constructor(
    private readonly jiraIntegrations: JiraIntegrationStore,
    private readonly jiraIntake?: JiraIntakeService
  ) {}

  public readonly listIntegrations: RequestHandler = async (req, res, next) => {
    try {
      const user = currentUser(req);
      res.json({ jira: await this.jiraIntegrations.listSettings(user.userId) });
    } catch (error) {
      next(error);
    }
  };

  public readonly listJiraIntegrations: RequestHandler = async (req, res, next) => {
    try {
      const user = currentUser(req);
      res.json({ integrations: await this.jiraIntegrations.listSettings(user.userId) });
    } catch (error) {
      next(error);
    }
  };

  public readonly runDefaultJiraIntake: RequestHandler = async (req, res, next) => {
    try {
      if (!this.jiraIntake) return res.status(503).json({ error: "Jira intake is not configured" });
      const user = maybeCurrentUser(req);
      const input = parseJiraIntakeInput(req.body);
      logJiraIntakeRequest("received", {
        route: "/jira/intake",
        userId: user?.userId,
        authenticated: Boolean(user),
        integrationId: input.integrationId,
        maxIssues: input.maxIssues,
        dryRun: input.dryRun
      });
      const result = await this.jiraIntake.run({
        userId: user?.userId,
        integrationId: input.integrationId,
        maxIssues: input.maxIssues,
        dryRun: input.dryRun
      });
      logJiraIntakeRequest("responding", {
        route: "/jira/intake",
        userId: user?.userId,
        authenticated: Boolean(user),
        integrationId: input.integrationId,
        statusCode: input.dryRun ? 200 : 202,
        processed: result.processed,
        queued: result.queued,
        skipped: result.skipped,
        failed: result.failed,
        dryRun: result.dryRun
      });
      res.status(input.dryRun ? 200 : 202).json(result);
    } catch (error) {
      console.error("[jira-intake:route] failed", {
        route: "/jira/intake",
        error: error instanceof Error ? error.message : String(error)
      });
      next(error);
    }
  };

  public readonly testNewJiraConnection: RequestHandler = async (req, res) => {
    try {
      currentUser(req);
      const input = parseConnectionInput(req.body);
      const validationError = validateConnectionInput(input);
      if (validationError) return res.status(400).json({ error: validationError });
      if (!input.apiToken) return res.status(400).json({ error: "apiToken is required to test Jira credentials" });

      const client = new JiraClient({
        siteUrl: input.siteUrl ?? "",
        email: input.email ?? "",
        apiToken: input.apiToken
      });
      await client.testConnection();
      res.json({ ok: true });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : "Unable to reach Jira" });
    }
  };

  public readonly getJiraIntegration: RequestHandler = async (req, res, next) => {
    try {
      const user = currentUser(req);
      res.json(await this.jiraIntegrations.getSettingsForUser(user.userId, req.params.integrationId));
    } catch (error) {
      next(error);
    }
  };

  public readonly createJiraConnection: RequestHandler = async (req, res, next) => {
    try {
      const user = currentUser(req);
      const input = parseConnectionInput(req.body);
      const validationError = validateConnectionInput(input);
      if (validationError) return res.status(400).json({ error: validationError });
      if (!input.apiToken) return res.status(400).json({ error: "apiToken is required when connecting Jira for the first time" });

      res.json(await this.jiraIntegrations.saveConnection(user.userId, input));
    } catch (error) {
      next(error);
    }
  };

  public readonly updateJiraConnection: RequestHandler = async (req, res, next) => {
    try {
      const user = currentUser(req);
      const input = parseConnectionInput(req.body);
      const validationError = validateConnectionInput(input);
      if (validationError) return res.status(400).json({ error: validationError });
      const existing = await this.jiraIntegrations.getSettingsForUser(user.userId, req.params.integrationId);
      if (!input.apiToken && !existing.connected) {
        return res.status(400).json({ error: "apiToken is required when connecting Jira for the first time" });
      }

      res.json(await this.jiraIntegrations.saveConnection(user.userId, input, req.params.integrationId));
    } catch (error) {
      next(error);
    }
  };

  public readonly testJiraConnection: RequestHandler = async (req, res) => {
    try {
      const user = currentUser(req);
      const client = await getClient(this.jiraIntegrations, user.userId, req.params.integrationId);
      await client.testConnection();
      res.json({ ok: true });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : "Unable to reach Jira" });
    }
  };

  public readonly runJiraIntake: RequestHandler = async (req, res, next) => {
    try {
      if (!this.jiraIntake) return res.status(503).json({ error: "Jira intake is not configured" });
      const user = maybeCurrentUser(req);
      const input = parseJiraIntakeInput(req.body);
      logJiraIntakeRequest("received", {
        route: "/jira/:integrationId/intake",
        userId: user?.userId,
        authenticated: Boolean(user),
        integrationId: req.params.integrationId,
        bodyIntegrationId: input.integrationId,
        maxIssues: input.maxIssues,
        dryRun: input.dryRun
      });
      const result = await this.jiraIntake.run({
        userId: user?.userId,
        integrationId: req.params.integrationId,
        maxIssues: input.maxIssues,
        dryRun: input.dryRun
      });
      logJiraIntakeRequest("responding", {
        route: "/jira/:integrationId/intake",
        userId: user?.userId,
        authenticated: Boolean(user),
        integrationId: req.params.integrationId,
        statusCode: input.dryRun ? 200 : 202,
        processed: result.processed,
        queued: result.queued,
        skipped: result.skipped,
        failed: result.failed,
        dryRun: result.dryRun
      });
      res.status(input.dryRun ? 200 : 202).json(result);
    } catch (error) {
      console.error("[jira-intake:route] failed", {
        route: "/jira/:integrationId/intake",
        integrationId: req.params.integrationId,
        error: error instanceof Error ? error.message : String(error)
      });
      next(error);
    }
  };

  public readonly listJiraBoards: RequestHandler = async (req, res) => {
    try {
      const user = currentUser(req);
      const client = await getClient(this.jiraIntegrations, user.userId, req.params.integrationId);
      res.json({ boards: await client.listBoards() });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : "Unable to load Jira boards" });
    }
  };

  public readonly saveJiraBoard: RequestHandler = async (req, res, next) => {
    try {
      const user = currentUser(req);
      const input = parseBoardInput(req.body);
      const validationError = validateBoardInput(input);
      if (validationError) return res.status(400).json({ error: validationError });

      res.json(await this.jiraIntegrations.saveBoard(user.userId, req.params.integrationId, input));
    } catch (error) {
      next(error);
    }
  };

  public readonly listJiraBoardStatuses: RequestHandler = async (req, res) => {
    try {
      const user = currentUser(req);
      const boardId = Number(req.params.boardId);
      if (!Number.isInteger(boardId)) return res.status(400).json({ error: "boardId must be an integer" });

      const client = await getClient(this.jiraIntegrations, user.userId, req.params.integrationId);
      res.json({ statuses: await client.getBoardStatuses(boardId) });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : "Unable to load Jira board statuses" });
    }
  };

  public readonly saveJiraReadyStatus: RequestHandler = async (req, res, next) => {
    try {
      const user = currentUser(req);
      const settings = await this.jiraIntegrations.getSettingsForUser(user.userId, req.params.integrationId);
      if (!settings.boardId) return res.status(400).json({ error: "Select a Jira board before choosing a ready status" });

      const input = parseReadyStatusInput(req.body);
      const validationError = validateReadyStatusInput(input);
      if (validationError) return res.status(400).json({ error: validationError });

      res.json(await this.jiraIntegrations.saveReadyStatus(user.userId, req.params.integrationId, input));
    } catch (error) {
      next(error);
    }
  };

  public readonly saveJiraWorkflow: RequestHandler = async (req, res, next) => {
    try {
      const user = currentUser(req);
      const input = parseWorkflowInput(req.body);
      const validationError = validateWorkflowInput(input);
      if (validationError) return res.status(400).json({ error: validationError });

      res.json(await this.jiraIntegrations.saveWorkflow(user.userId, req.params.integrationId, input));
    } catch (error) {
      next(error);
    }
  };

  public readonly setJiraEnabled: RequestHandler = async (req, res, next) => {
    try {
      const user = currentUser(req);
      const enabled = readEnabled(req.body);
      if (enabled === undefined) return res.status(400).json({ error: "enabled must be a boolean" });

      const settings = await this.jiraIntegrations.getSettingsForUser(user.userId, req.params.integrationId);
      if (!settings.id) return res.status(404).json({ error: "Jira integration not found" });
      if (enabled && !hasCompleteWorkflow(settings)) {
        return res.status(400).json({ error: "Jira workflow must be saved before enabling intake" });
      }

      const saved = await this.jiraIntegrations.setEnabled(user.userId, req.params.integrationId, enabled);
      if (!saved) return res.status(404).json({ error: "Jira integration not found" });
      res.json(saved);
    } catch (error) {
      next(error);
    }
  };

  public readonly sampleReadyJiraIssue: RequestHandler = async (req, res) => {
    try {
      const user = currentUser(req);
      const credentials = await this.jiraIntegrations.getCredentials(user.userId, req.params.integrationId);
      if (!credentials) return res.status(400).json({ error: "Jira credentials are not configured" });
      if (!credentials.readyStatusName) return res.status(400).json({ error: "Ready status is not configured" });

      const client = new JiraClient(credentials);
      const [issue] = await client.searchIssues(buildReadyJql(credentials.boardFilterId, credentials.readyStatusName), 1);
      res.json({ issue });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : "Unable to load a ready Jira issue" });
    }
  };

  public readonly listJiraIssueTransitions: RequestHandler = async (req, res) => {
    try {
      const user = currentUser(req);
      const client = await getClient(this.jiraIntegrations, user.userId, req.params.integrationId);
      res.json({ transitions: await client.getTransitions(req.params.issueKey) });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : "Unable to load Jira transitions" });
    }
  };

  public readonly saveJiraProcessedStatus: RequestHandler = async (req, res, next) => {
    try {
      const user = currentUser(req);
      const input = parseProcessedStatusInput(req.body);
      const settings = await this.jiraIntegrations.getSettingsForUser(user.userId, req.params.integrationId);
      const validationError = validateProcessedStatusInput(input, settings);
      if (validationError) return res.status(400).json({ error: validationError });

      res.json(await this.jiraIntegrations.saveProcessedStatus(user.userId, req.params.integrationId, input));
    } catch (error) {
      next(error);
    }
  };

  public readonly saveJiraProcessedTransition: RequestHandler = async (req, res, next) => {
    try {
      const user = currentUser(req);
      const input = parseProcessedStatusInput(req.body);
      const settings = await this.jiraIntegrations.getSettingsForUser(user.userId, req.params.integrationId);
      const validationError = validateProcessedStatusInput(input, settings);
      if (validationError) return res.status(400).json({ error: validationError });

      res.json(await this.jiraIntegrations.saveProcessedStatus(user.userId, req.params.integrationId, input));
    } catch (error) {
      next(error);
    }
  };

  public readonly saveJiraSettings: RequestHandler = async (req, res, next) => {
    try {
      const user = currentUser(req);
      const connectionInput = parseConnectionInput(req.body);
      const connectionError = validateConnectionInput(connectionInput);
      if (connectionError) return res.status(400).json({ error: connectionError });

      const existing = await this.jiraIntegrations.getSettingsForUser(user.userId, req.params.integrationId);
      if (!connectionInput.apiToken && !existing.connected) {
        return res.status(400).json({ error: "apiToken is required when enabling Jira for the first time" });
      }

      await this.jiraIntegrations.saveConnection(user.userId, connectionInput, req.params.integrationId);
      res.json(await this.jiraIntegrations.saveProcessedStatus(user.userId, req.params.integrationId, parseProcessedStatusInput(req.body)));
    } catch (error) {
      next(error);
    }
  };

  public readonly deleteJiraIntegration: RequestHandler = async (req, res, next) => {
    try {
      const user = currentUser(req);
      const deleted = await this.jiraIntegrations.delete(user.userId, req.params.integrationId);
      if (!deleted) return res.status(404).json({ error: "Jira integration not found" });
      res.json(deleted);
    } catch (error) {
      next(error);
    }
  };

  public readonly testJiraWorkflow: RequestHandler = async (req, res) => {
    try {
      const user = currentUser(req);
      const credentials = await this.jiraIntegrations.getCredentials(user.userId, req.params.integrationId);
      if (!credentials) {
        return res.status(400).json({ error: "Jira credentials are not configured" });
      }
      if (!credentials.readyStatusName) {
        return res.status(400).json({ error: "Ready status is not configured" });
      }

      const client = new JiraClient(credentials);
      await client.testConnection();
      const readyJql = buildReadyJql(credentials.boardFilterId, credentials.readyStatusName);
      const [matchingIssue] = await client.searchIssues(readyJql, 1);
      const statuses = credentials.boardId ? await client.getBoardStatuses(credentials.boardId) : [];
      const configuredProcessingStatus = credentials.processingStatusId
        ? statuses.find((status) => status.id === credentials.processingStatusId)
        : undefined;
      const configuredStatus = credentials.processedStatusId
        ? statuses.find((status) => status.id === credentials.processedStatusId)
        : undefined;

      res.json({
        ok: true,
        matchingIssue,
        availableStatuses: statuses,
        processingStatusValidated: credentials.processingStatusId ? Boolean(configuredProcessingStatus) : false,
        processedStatusValidated: credentials.processedStatusId ? Boolean(configuredStatus) : false
      });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : "Unable to reach Jira" });
    }
  };

  public readonly listJiraTransitions: RequestHandler = async (req, res) => {
    try {
      const user = currentUser(req);
      const client = await getClient(this.jiraIntegrations, user.userId, req.params.integrationId);
      res.json({ transitions: await client.getTransitions(req.params.issueKey) });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : "Unable to reach Jira" });
    }
  };
}

export function createIntegrationController(
  jiraIntegrations: JiraIntegrationStore,
  jiraIntake?: JiraIntakeService
): IntegrationController {
  return new IntegrationController(jiraIntegrations, jiraIntake);
}

function currentUser(req: { user?: unknown }): User {
  return req.user as User;
}

function maybeCurrentUser(req: { user?: unknown }): User | undefined {
  return req.user as User | undefined;
}
