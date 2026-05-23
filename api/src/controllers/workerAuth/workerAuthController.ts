import { RequestHandler } from "express";
import { ApiToWorkerTokenIssuer, WorkerTokenService } from "../../auth/workerTokens.js";
import { JiraClient } from "../../integrations/jira/jiraClient.js";
import { IntegrationIntakeEventStore } from "../../store/integrations/integrationIntakeEventStore.js";
import { JiraIntegrationStore } from "../../store/integrations/jiraIntegrationStore.js";
import { AppStore } from "../../store/tenantStore.js";
import {
  parseWorkerTokenRequest,
  readBearerToken,
  readImageAttachmentMetadata,
  readRefreshToken,
  validateWorkerTokenRequest
} from "./workerAuthRequests.js";
import { sendJiraAttachment } from "./workerAuthResponses.js";

export class WorkerAuthController {
  public constructor(
    private readonly tenants: AppStore,
    private readonly tokens: WorkerTokenService,
    private readonly apiToWorkerTokens: ApiToWorkerTokenIssuer,
    private readonly workerConfigEncryptionKey: string,
    private readonly intakeEvents?: IntegrationIntakeEventStore,
    private readonly jiraIntegrations?: JiraIntegrationStore
  ) {}

  public readonly issueToken: RequestHandler = async (req, res, next) => {
    try {
      const input = parseWorkerTokenRequest(req.body);
      const validationError = validateWorkerTokenRequest(input);
      if (validationError) return res.status(400).json({ error: validationError });

      const authenticated = await this.tenants.authenticateApiKey(input.apiKey!, input.apiSecret!);
      if (!authenticated) {
        return res.status(401).json({ error: "invalid API credentials" });
      }

      res.json({
        ...(await this.tokens.issue(input.workerId!.trim(), authenticated)),
        configEncryptionKey: this.workerConfigEncryptionKey
      });
    } catch (error) {
      next(error);
    }
  };

  public readonly refreshToken: RequestHandler = async (req, res, next) => {
    try {
      const refreshToken = readRefreshToken(req.body);
      if (!refreshToken) return res.status(400).json({ error: "refreshToken is required" });

      const tokenPair = await this.tokens.refresh(refreshToken);
      if (!tokenPair) return res.status(401).json({ error: "invalid refresh token" });

      res.json(tokenPair);
    } catch (error) {
      next(error);
    }
  };

  public readonly publicKey: RequestHandler = (_req, res) => {
    res.json({
      alg: "RS256",
      publicKey: this.apiToWorkerTokens.publicKey
    });
  };

  public readonly downloadJiraAttachment: RequestHandler = async (req, res, next) => {
    try {
      if (!this.intakeEvents || !this.jiraIntegrations) {
        return res.status(503).json({ error: "Jira attachment download is not configured" });
      }

      const token = readBearerToken(req.headers.authorization);
      if (!token) return res.status(401).json({ error: "worker bearer token is required" });

      const worker = await this.tokens.verifyAccessToken(token);
      if (!worker) return res.status(401).json({ error: "invalid worker token" });

      const event = await this.intakeEvents.getBySourceItemId("jira", req.params.integrationId, req.params.issueId);
      if (!event || event.userId !== worker.userId || event.workerId !== worker.workerId) {
        return res.status(404).json({ error: "attachment not found" });
      }

      const attachment = readImageAttachmentMetadata(event.metadata, req.params.attachmentId);
      if (!attachment) return res.status(404).json({ error: "attachment not found" });

      const credentials = await this.jiraIntegrations.getCredentials(event.userId, event.integrationId);
      if (!credentials) return res.status(404).json({ error: "Jira integration not found" });

      const content = await new JiraClient(credentials).downloadAttachmentContent(attachment.contentUrl);
      sendJiraAttachment(res, attachment, content);
    } catch (error) {
      next(error);
    }
  };
}

export function createWorkerAuthController(
  tenants: AppStore,
  tokens: WorkerTokenService,
  apiToWorkerTokens: ApiToWorkerTokenIssuer,
  workerConfigEncryptionKey: string,
  intakeEvents?: IntegrationIntakeEventStore,
  jiraIntegrations?: JiraIntegrationStore
): WorkerAuthController {
  return new WorkerAuthController(
    tenants,
    tokens,
    apiToWorkerTokens,
    workerConfigEncryptionKey,
    intakeEvents,
    jiraIntegrations
  );
}
