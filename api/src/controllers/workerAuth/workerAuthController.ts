import { RequestHandler } from "express";
import { ApiToWorkerTokenIssuer, WorkerTokenService } from "../../auth/workerTokens.js";
import { IntegrationLifecycleService } from "../../integrations/integrationLifecycleService.js";
import { JiraClient } from "../../integrations/jira/jiraClient.js";
import { IntegrationIntakeEventStore } from "../../store/integrations/integrationIntakeEventStore.js";
import { JiraIntegrationStore } from "../../store/integrations/jiraIntegrationStore.js";
import { JiraTicketClaimStore } from "../../store/integrations/jiraTicketClaimStore.js";
import { AppStore } from "../../store/tenantStore.js";
import { readCleanString, readPlainObject } from "../../shared/readers.js";
import { asyncHandler, requireUser, requireWorkerBearerToken } from "../controllerHelpers.js";
import {
  parseWorkerTokenRequest,
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

  public readonly issueToken: RequestHandler = asyncHandler(async (req, res) => {
    const input = parseWorkerTokenRequest(req.body);
    const validationError = validateWorkerTokenRequest(input);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const user = requireUser(req, res);
    if (!user) return;

    res.json({
      ...(await this.tokens.issue(input.workerId!.trim(), user)),
      configEncryptionKey: this.workerConfigEncryptionKey
    });
  });

  public readonly refreshToken: RequestHandler = asyncHandler(async (req, res) => {
    const refreshToken = readRefreshToken(req.body);
    if (!refreshToken) {
      res.status(400).json({ error: "refreshToken is required" });
      return;
    }

    const tokenPair = await this.tokens.refresh(refreshToken);
    if (!tokenPair) {
      res.status(401).json({ error: "invalid refresh token" });
      return;
    }

    res.json(tokenPair);
  });

  public readonly publicKey: RequestHandler = (_req, res) => {
    res.json({
      alg: "RS256",
      publicKey: this.apiToWorkerTokens.publicKey
    });
  };

  public readonly downloadJiraAttachment: RequestHandler = asyncHandler(async (req, res) => {
    if (!this.intakeEvents || !this.jiraIntegrations) {
      res.status(503).json({ error: "Jira attachment download is not configured" });
      return;
    }

    const worker = await requireWorkerBearerToken(this.tokens, req.headers.authorization, res);
    if (!worker) return;

    const resolved = await this.intakeEvents.getByIdForWorker(
      req.params.eventId,
      worker.workerId,
      worker.userId,
    );
    if (!resolved) {
      res.status(404).json({ error: "attachment not found" });
      return;
    }

    const { event, participant } = resolved;
    const attachment = readImageAttachmentMetadata(event.metadata, req.params.attachmentId);
    if (!attachment) {
      res.status(404).json({ error: "attachment not found" });
      return;
    }

    const credentials = await this.jiraIntegrations.getCredentials(participant.userId, participant.integrationId, worker.workerId);
    if (!credentials) {
      res.status(404).json({ error: "Jira integration not found" });
      return;
    }

    const content = await new JiraClient(credentials).downloadAttachmentContent(attachment.contentUrl);
    sendJiraAttachment(res, attachment, content);
  });

  public readonly claimJiraTicket: RequestHandler = asyncHandler(async (req, res) => {
    if (!this.jiraTicketClaims) {
      res.status(503).json({ error: "Jira ticket claiming is not configured" });
      return;
    }

    const worker = await requireWorkerBearerToken(this.tokens, req.headers.authorization, res);
    if (!worker) return;

    const input = readJiraClaimRequest(req.body);
    if (!input) {
      res.status(400).json({
        error: "integrationId, sourceItemId, sourceItemKey, sourceItemUrl, repositoryUrl, normalizedRepositoryUrl, and command are required",
      });
      return;
    }
    const integration = await this.jiraIntegrations?.getCredentials(
      worker.userId,
      input.integrationId,
      worker.workerId,
    );
    if (this.jiraIntegrations && !integration) {
      res.status(403).json({ error: "Jira integration does not belong to this worker" });
      return;
    }

    const result = await this.jiraTicketClaims.claim({
      workerId: worker.workerId,
      userId: worker.userId,
      ...input,
    });

    if (!result.claimed) {
      res.status(409).json({
        claimed: false,
        ...(result.reason ? { reason: result.reason } : {}),
        event: result.event
          ? {
              id: result.event.id,
              status: result.event.status,
              workerId: result.event.workerId,
              transactionId: result.event.transactionId,
            }
          : undefined,
      });
      return;
    }

    await this.lifecycle?.commandStarted(result.command);
    res.status(201).json({
      claimed: true,
      transactionId: result.command.transactionId,
      eventId: result.event.id,
      command: result.command,
    });
  });
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
    metadata: readPlainObject(body.metadata),
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
