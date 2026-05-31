import { RequestHandler } from "express";
import { ApiToWorkerTokenIssuer, WorkerTokenService } from "../../auth/workerTokens.js";
import { IntegrationLifecycleService } from "../../integrations/integrationLifecycleService.js";
import { JiraClient } from "../../integrations/jira/jiraClient.js";
import { IntegrationIntakeEventStore } from "../../store/integrations/integrationIntakeEventStore.js";
import { JiraIntegrationStore } from "../../store/integrations/jiraIntegrationStore.js";
import { JiraTicketClaimStore } from "../../store/integrations/jiraTicketClaimStore.js";
import { AppStore } from "../../store/tenantStore.js";
import { User } from "../../types.js";
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
    private readonly jiraIntegrations?: JiraIntegrationStore,
    private readonly jiraTicketClaims?: JiraTicketClaimStore,
    private readonly lifecycle?: IntegrationLifecycleService
  ) {}

  public readonly issueToken: RequestHandler = async (req, res, next) => {
    try {
      const input = parseWorkerTokenRequest(req.body);
      const validationError = validateWorkerTokenRequest(input);
      if (validationError) return res.status(400).json({ error: validationError });

      const user = req.user as User | undefined;
      if (!user) return res.status(401).json({ error: "authentication required" });

      res.json({
        ...(await this.tokens.issue(input.workerId!.trim(), user)),
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

      const resolved = await this.intakeEvents.getByIdForWorker(
        req.params.eventId,
        worker.workerId,
        worker.userId,
      );
      if (!resolved) {
        return res.status(404).json({ error: "attachment not found" });
      }

      const { event, participant } = resolved;
      const attachment = readImageAttachmentMetadata(event.metadata, req.params.attachmentId);
      if (!attachment) return res.status(404).json({ error: "attachment not found" });

      const credentials = await this.jiraIntegrations.getCredentials(participant.userId, participant.integrationId, worker.workerId);
      if (!credentials) return res.status(404).json({ error: "Jira integration not found" });

      const content = await new JiraClient(credentials).downloadAttachmentContent(attachment.contentUrl);
      sendJiraAttachment(res, attachment, content);
    } catch (error) {
      next(error);
    }
  };

  public readonly claimJiraTicket: RequestHandler = async (req, res, next) => {
    try {
      if (!this.jiraTicketClaims) {
        return res.status(503).json({ error: "Jira ticket claiming is not configured" });
      }

      const token = readBearerToken(req.headers.authorization);
      if (!token) return res.status(401).json({ error: "worker bearer token is required" });

      const worker = await this.tokens.verifyAccessToken(token);
      if (!worker) return res.status(401).json({ error: "invalid worker token" });

      const input = readJiraClaimRequest(req.body);
      if (!input) {
        return res.status(400).json({
          error: "integrationId, sourceItemId, sourceItemKey, sourceItemUrl, repositoryUrl, normalizedRepositoryUrl, and command are required",
        });
      }
      const integration = await this.jiraIntegrations?.getCredentials(
        worker.userId,
        input.integrationId,
        worker.workerId,
      );
      if (this.jiraIntegrations && !integration) {
        return res.status(403).json({ error: "Jira integration does not belong to this worker" });
      }

      const result = await this.jiraTicketClaims.claim({
        workerId: worker.workerId,
        userId: worker.userId,
        ...input,
      });

      if (!result.claimed) {
        return res.status(409).json({
          claimed: false,
          event: result.event
            ? {
                id: result.event.id,
                status: result.event.status,
                workerId: result.event.workerId,
                transactionId: result.event.transactionId,
              }
            : undefined,
        });
      }

      await this.lifecycle?.commandStarted(result.command);
      res.status(201).json({
        claimed: true,
        transactionId: result.command.transactionId,
        eventId: result.event.id,
        command: result.command,
      });
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
  jiraIntegrations?: JiraIntegrationStore,
  jiraTicketClaims?: JiraTicketClaimStore,
  lifecycle?: IntegrationLifecycleService
): WorkerAuthController {
  return new WorkerAuthController(
    tenants,
    tokens,
    apiToWorkerTokens,
    workerConfigEncryptionKey,
    intakeEvents,
    jiraIntegrations,
    jiraTicketClaims,
    lifecycle
  );
}

type JiraClaimRequest = {
  integrationId: string;
  sourceItemId: string;
  sourceItemKey: string;
  sourceItemUrl: string;
  repositoryUrl: string;
  normalizedRepositoryUrl: string;
  command: string;
  metadata?: Record<string, unknown>;
};

function readJiraClaimRequest(value: unknown): JiraClaimRequest | undefined {
  if (!value || typeof value !== "object") return undefined;
  const body = value as Record<string, unknown>;
  const input = {
    integrationId: readCleanString(body.integrationId),
    sourceItemId: readCleanString(body.sourceItemId),
    sourceItemKey: readCleanString(body.sourceItemKey),
    sourceItemUrl: readCleanString(body.sourceItemUrl),
    repositoryUrl: readCleanString(body.repositoryUrl),
    normalizedRepositoryUrl: readCleanString(body.normalizedRepositoryUrl),
    command: readCleanString(body.command),
    metadata: readMetadata(body.metadata),
  };

  if (
    !input.integrationId ||
    !input.sourceItemId ||
    !input.sourceItemKey ||
    !input.sourceItemUrl ||
    !input.repositoryUrl ||
    !input.normalizedRepositoryUrl ||
    !input.command
  ) {
    return undefined;
  }

  return input as JiraClaimRequest;
}

function readCleanString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

function readMetadata(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
