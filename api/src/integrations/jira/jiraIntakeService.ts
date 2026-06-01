import {
  JiraAttachmentSummary,
  JiraClient,
  JiraIssueSummary,
} from "./jiraClient.js";
import { WorkerStore } from "../../store/clientStore.js";
import {
  GitRepositoryStore,
  normalizeRepositoryUrl,
} from "../../store/gitRepositories/gitRepositoryStore.js";
import {
  JiraIntegrationCredentials,
  JiraIntegrationStore,
} from "../../store/integrations/jiraIntegrationStore.js";
import { IntegrationIntakeEventStore } from "../../store/integrations/integrationIntakeEventStore.js";

type CommandDispatcher = {
  dispatchQueuedCommands(workerId?: string): Promise<void>;
};

export type RunJiraIntakeInput = {
  userId?: string;
  integrationId?: string;
  maxIssues?: number;
  dryRun?: boolean;
};

export type JiraIntakeResultItem = {
  integrationId: string;
  issueKey: string;
  issueId: string;
  repositoryUrl?: string;
  normalizedRepositoryUrl?: string;
  workerId?: string;
  transactionId?: string;
  status: "queued" | "skipped" | "failed" | "dry_run";
  reason?: string;
};

export type GitflowJiraAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  size?: number;
  downloadUrl: string;
};

export type JiraIntakeResult = {
  processed: number;
  queued: number;
  skipped: number;
  failed: number;
  dryRun: boolean;
  items: JiraIntakeResultItem[];
};

type JiraIntakeRunContext = {
  input: RunJiraIntakeInput;
  maxIssues: number;
  dryRun: boolean;
};

type ReadyJiraIssueBatch = {
  integration: JiraIntegrationCredentials;
  repositoryFieldKeys: string[];
  issues: JiraIssueSummary[];
};

type JiraIssueWorkflowInput = {
  userId: string;
  integration: JiraIntegrationCredentials;
  issue: JiraIssueSummary;
  repositoryFieldKeys: string[];
  dryRun: boolean;
};

type RepositoryResolution = {
  repositoryUrl: string;
  normalizedRepositoryUrl: string;
};

type IntakeBeginResult = Awaited<ReturnType<IntegrationIntakeEventStore["begin"]>>;

export class JiraIntakeService {
  public constructor(
    private readonly jiraIntegrations: JiraIntegrationStore,
    private readonly intakeEvents: IntegrationIntakeEventStore,
    private readonly workers: WorkerStore,
    private readonly gitRepositories: GitRepositoryStore,
    private readonly dispatcher: CommandDispatcher,
  ) {}

  public async run(input: RunJiraIntakeInput): Promise<JiraIntakeResult> {
    const context = createRunContext(input);
    logJiraIntake("run started", {
      userId: input.userId,
      integrationId: input.integrationId,
      requestedMaxIssues: input.maxIssues,
      maxIssues: context.maxIssues,
      dryRun: context.dryRun,
    });

    const integrations = await this.loadEnabledIntegrations(context);
    const items: JiraIntakeResultItem[] = [];
    for (const integration of integrations) {
      const issueBatch = await this.loadReadyIssueBatch(context, integration);
      for (const issue of issueBatch.issues) {
        const item = await this.runIssueWorkflow({
          userId: issueBatch.integration.userId,
          integration: issueBatch.integration,
          issue,
          repositoryFieldKeys: ["repository", ...issueBatch.repositoryFieldKeys],
          dryRun: context.dryRun,
        });
        items.push(item);
        logJiraIntake("issue result", item);
      }
    }

    const result = buildResult(context, items);
    logJiraIntake("run finished", {
      userId: input.userId,
      integrationId: input.integrationId,
      processed: result.processed,
      queued: result.queued,
      skipped: result.skipped,
      failed: result.failed,
      dryRun: result.dryRun,
    });
    return result;
  }

  private async loadEnabledIntegrations(
    context: JiraIntakeRunContext,
  ): Promise<JiraIntegrationCredentials[]> {
    const { input } = context;
    const integrations = input.userId
      ? await this.jiraIntegrations.listEnabledCredentials(
          input.userId,
          input.integrationId,
        )
      : await this.jiraIntegrations.listAllEnabledCredentials(
          input.integrationId,
        );
    logJiraIntake("enabled integrations loaded", {
      userId: input.userId,
      requestedIntegrationId: input.integrationId,
      integrationCount: integrations.length,
      integrationIds: integrations.map((integration) => integration.id),
    });
    return integrations;
  }

  private async loadReadyIssueBatch(
    context: JiraIntakeRunContext,
    integration: JiraIntegrationCredentials,
  ): Promise<ReadyJiraIssueBatch> {
    const client = new JiraClient(integration);
    const jql = buildReadyJql(
      integration.boardFilterId,
      integration.readyStatusName,
    );
    logJiraIntake("searching ready issues", {
      userId: context.input.userId,
      integrationId: integration.id,
      siteUrl: integration.siteUrl,
      boardId: integration.boardId,
      boardName: integration.boardName,
      boardFilterId: integration.boardFilterId,
      readyStatusId: integration.readyStatusId,
      readyStatusName: integration.readyStatusName,
      maxIssues: context.maxIssues,
      jql,
    });

    const repositoryFieldKeys = await resolveRepositoryFieldKeys(client);
    logJiraIntake("repository fields resolved", {
      userId: context.input.userId,
      integrationId: integration.id,
      repositoryFieldKeys,
    });

    const issues = await client.searchIssues(jql, context.maxIssues, [
      "summary",
      "status",
      "description",
      "attachment",
      ...(repositoryFieldKeys.length ? repositoryFieldKeys : ["repository"]),
    ]);
    logJiraIntake("ready issues received", {
      userId: context.input.userId,
      integrationId: integration.id,
      issueCount: issues.length,
      issueKeys: issues.map((issue) => issue.key),
    });

    return {
      integration,
      repositoryFieldKeys,
      issues,
    };
  }

  private async runIssueWorkflow(
    workflow: JiraIssueWorkflowInput,
  ): Promise<JiraIntakeResultItem> {
    const { userId, integration, issue, repositoryFieldKeys, dryRun } = workflow;
    logJiraIntake("processing issue", issue);
    const repository = resolveIssueRepository(issue, repositoryFieldKeys);
    if (!repository) {
      console.warn("[jira-intake] handling issue without repository", {
        userId,
        integrationId: integration.id,
        issueKey: issue.key,
        issueId: issue.id,
      });
      return handleMissingRepositoryIssue(integration, issue, dryRun);
    }

    logJiraIntake("repository field read", {
      userId,
      integrationId: integration.id,
      issueKey: issue.key,
      repositoryUrl: repository.repositoryUrl,
      normalizedRepositoryUrl: repository.normalizedRepositoryUrl,
    });
    if (dryRun) {
      logJiraIntake("dry-run issue would queue", {
        userId,
        integrationId: integration.id,
        issueKey: issue.key,
        repositoryUrl: repository.repositoryUrl,
        normalizedRepositoryUrl: repository.normalizedRepositoryUrl,
      });
      return {
        integrationId: integration.id,
        issueKey: issue.key,
        issueId: issue.id,
        repositoryUrl: repository.repositoryUrl,
        normalizedRepositoryUrl: repository.normalizedRepositoryUrl,
        status: "dry_run",
      };
    }

    const intake = await this.beginIntakeEvent(workflow, repository);
    if (!intake.created) {
      console.warn("[jira-intake] skipping existing intake event", {
        userId,
        integrationId: integration.id,
        issueKey: issue.key,
        intakeEventId: intake.event.id,
        status: intake.event.status,
        workerId: intake.event.workerId,
        transactionId: intake.event.transactionId,
      });
      return {
        integrationId: integration.id,
        issueKey: issue.key,
        issueId: issue.id,
        repositoryUrl: repository.repositoryUrl,
        normalizedRepositoryUrl: repository.normalizedRepositoryUrl,
        workerId: intake.event.workerId,
        transactionId: intake.event.transactionId,
        status: "skipped",
        reason: `already ${intake.event.status}`,
      };
    }

    return this.queueGitflowCommand(workflow, repository, intake);
  }

  private async beginIntakeEvent(
    workflow: JiraIssueWorkflowInput,
    repository: RepositoryResolution,
  ): Promise<IntakeBeginResult> {
    const { userId, integration, issue } = workflow;
    const intake = await this.intakeEvents.begin({
      userId,
      provider: "jira",
      integrationId: integration.id,
      sourceItemId: issue.id,
      sourceItemKey: issue.key,
      sourceItemUrl: buildIssueUrl(integration.siteUrl, issue.key),
      repositoryUrl: repository.repositoryUrl,
      normalizedRepositoryUrl: repository.normalizedRepositoryUrl,
      metadata: {
        issueId: issue.id,
        issueKey: issue.key,
        imageAttachments: readImageAttachments(issue),
      },
    });
    logJiraIntake("intake event checked", {
      userId,
      integrationId: integration.id,
      issueKey: issue.key,
      intakeEventId: intake.event.id,
      created: intake.created,
      status: intake.event.status,
      workerId: intake.event.workerId,
      transactionId: intake.event.transactionId,
    });
    return intake;
  }

  private async queueGitflowCommand(
    workflow: JiraIssueWorkflowInput,
    repository: RepositoryResolution,
    intake: IntakeBeginResult,
  ): Promise<JiraIntakeResultItem> {
    const { userId, integration, issue } = workflow;
    try {
      const sourceBranch = "main";
      const targetBranch = "main";
      logJiraIntake("creating worker command", {
        userId,
        integrationId: integration.id,
        issueKey: issue.key,
        intakeEventId: intake.event.id,
        repositoryUrl: repository.repositoryUrl,
        normalizedRepositoryUrl: repository.normalizedRepositoryUrl,
        sourceBranch,
        targetBranch,
      });
      const command = await this.workers.createQueuedCommand({
        userId,
        command: JSON.stringify({
          repositoryUrl: repository.repositoryUrl,
          sourceBranch,
          targetBranch,
          ticketNumber: issue.key,
          ticketUrl: buildIssueUrl(integration.siteUrl, issue.key),
          title: issue.summary,
          description: readJiraText(issue.fields?.description),
          attachments: buildGitflowAttachments(intake.event.id, issue),
        }),
        repositoryUrl: repository.repositoryUrl,
        normalizedRepositoryUrl: repository.normalizedRepositoryUrl,
        commandMode: "gitflow",
      });
      logJiraIntake("queued gitflow command", {
        userId,
        integrationId: integration.id,
        issueKey: issue.key,
        repositoryUrl: repository.repositoryUrl,
        sourceBranch,
      });
      await this.intakeEvents.markQueued(
        intake.event.id,
        command.transactionId,
      );
      logJiraIntake("intake event marked queued", {
        userId,
        integrationId: integration.id,
        issueKey: issue.key,
        intakeEventId: intake.event.id,
        transactionId: command.transactionId,
      });
      await this.dispatcher.dispatchQueuedCommands();
      logJiraIntake("queued commands dispatched", {
        userId,
        integrationId: integration.id,
        issueKey: issue.key,
        transactionId: command.transactionId,
      });

      return {
        integrationId: integration.id,
        issueKey: issue.key,
        issueId: issue.id,
        repositoryUrl: repository.repositoryUrl,
        normalizedRepositoryUrl: repository.normalizedRepositoryUrl,
        transactionId: command.transactionId,
        status: "queued",
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error("[jira-intake] failed processing issue", {
        userId,
        integrationId: integration.id,
        issueKey: issue.key,
        intakeEventId: intake.event.id,
        reason,
      });
      await this.intakeEvents.markFailed(intake.event.id, reason);
      return {
        integrationId: integration.id,
        issueKey: issue.key,
        issueId: issue.id,
        repositoryUrl: repository.repositoryUrl,
        normalizedRepositoryUrl: repository.normalizedRepositoryUrl,
        status: "failed",
        reason,
      };
    }
  }
}

function createRunContext(input: RunJiraIntakeInput): JiraIntakeRunContext {
  return {
    input,
    maxIssues: normalizeMaxIssues(input.maxIssues),
    dryRun: Boolean(input.dryRun),
  };
}

function buildResult(
  context: JiraIntakeRunContext,
  items: JiraIntakeResultItem[],
): JiraIntakeResult {
  return {
    processed: items.length,
    queued: items.filter((item) => item.status === "queued").length,
    skipped: items.filter((item) => item.status === "skipped").length,
    failed: items.filter((item) => item.status === "failed").length,
    dryRun: context.dryRun,
    items,
  };
}

async function handleMissingRepositoryIssue(
  integration: JiraIntegrationCredentials,
  issue: JiraIssueSummary,
  dryRun: boolean,
): Promise<JiraIntakeResultItem> {
  const baseItem = {
    integrationId: integration.id,
    issueKey: issue.key,
    issueId: issue.id,
  };

  if (dryRun) {
    return {
      ...baseItem,
      status: "dry_run",
      reason: "repository field is missing; would comment and move issue to processed status",
    };
  }

  if (!integration.processedStatusId || !integration.processedStatusName) {
    return {
      ...baseItem,
      status: "failed",
      reason: "processed status is not configured",
    };
  }

  try {
    const jira = new JiraClient(integration);
    await jira.addComment(issue.key, buildMissingRepositoryComment());
    await jira.transitionIssue(
      issue.key,
      integration.processedStatusId,
      integration.processedStatusName,
    );

    return {
      ...baseItem,
      status: "skipped",
      reason: "repository field is missing",
    };
  } catch (error) {
    return {
      ...baseItem,
      status: "failed",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildMissingRepositoryComment(): string {
  return "FirstDraft could not process this ticket because the required repository field is missing. Add a repository URL to the repository field before sending this ticket back for processing.";
}

function logJiraIntake(
  message: string,
  details: Record<string, unknown>,
): void {
  console.log(`[jira-intake] ${message}`, details);
}

async function resolveRepositoryFieldKeys(
  client: JiraClient,
): Promise<string[]> {
  try {
    const fields = await client.findFields("repository");
    const keys = new Set<string>();
    for (const field of fields) {
      keys.add(field.id);
      keys.add(field.key);
    }
    return [...keys];
  } catch (error) {
    console.warn("[jira-intake] failed resolving repository field", {
      reason: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function readRepositoryField(
  issue: JiraIssueSummary,
  repositoryFieldKeys: string[],
): string | undefined {
  for (const fieldKey of repositoryFieldKeys) {
    const repositoryUrl = readRepositoryFieldValue(issue.fields?.[fieldKey]);
    if (repositoryUrl) return repositoryUrl;
  }
  return undefined;
}

function resolveIssueRepository(
  issue: JiraIssueSummary,
  repositoryFieldKeys: string[],
): RepositoryResolution | undefined {
  const repositoryUrl = readRepositoryField(issue, repositoryFieldKeys);
  if (!repositoryUrl) return undefined;
  return {
    repositoryUrl,
    normalizedRepositoryUrl: normalizeRepositoryUrl(repositoryUrl),
  };
}

function readRepositoryFieldValue(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const repositoryUrl = readRepositoryFieldValue(item);
      if (repositoryUrl) return repositoryUrl;
    }
  }
  if (value && typeof value === "object") {
    const namedValue = value as { value?: unknown; name?: unknown };
    if (typeof namedValue.value === "string")
      return namedValue.value.trim() || undefined;
    if (typeof namedValue.name === "string")
      return namedValue.name.trim() || undefined;
  }
  return undefined;
}

function buildGitflowAttachments(
  eventId: string,
  issue: JiraIssueSummary,
): GitflowJiraAttachment[] {
  return readImageAttachments(issue)
    .slice(0, maxGitflowImageAttachments)
    .map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
      downloadUrl: `/api/worker-auth/jira-attachments/${encodeURIComponent(eventId)}/${encodeURIComponent(attachment.id)}`,
    }));
}

export function readImageAttachments(issue: JiraIssueSummary): JiraAttachmentSummary[] {
  const attachments = issue.fields?.attachment;
  if (!Array.isArray(attachments)) return [];

  const images: JiraAttachmentSummary[] = [];
  let totalBytes = 0;
  for (const attachment of attachments) {
    const parsed = readAttachment(attachment);
    if (!parsed) continue;
    if (!isSupportedImageMimeType(parsed.mimeType)) continue;
    const size = parsed.size ?? 0;
    if (size > maxGitflowImageAttachmentBytes) continue;
    if (totalBytes + size > maxGitflowImageAttachmentTotalBytes) break;
    totalBytes += size;
    images.push(parsed);
  }

  return images;
}

function readAttachment(value: unknown): JiraAttachmentSummary | undefined {
  if (!value || typeof value !== "object") return undefined;
  const attachment = value as Record<string, unknown>;
  const id = readCleanString(attachment.id);
  const filename = readCleanString(attachment.filename);
  const mimeType = readCleanString(attachment.mimeType);
  const contentUrl = readCleanString(attachment.content);
  const size =
    typeof attachment.size === "number" && Number.isFinite(attachment.size)
      ? attachment.size
      : undefined;
  if (!id || !filename || !mimeType || !contentUrl) return undefined;
  return { id, filename, mimeType, size, contentUrl };
}

export function isSupportedImageMimeType(value: string): boolean {
  return supportedGitflowImageMimeTypes.has(value.trim().toLowerCase());
}

function readCleanString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

function buildIssueUrl(siteUrl: string, issueKey: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/browse/${encodeURIComponent(issueKey)}`;
}

function readJiraText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value))
    return value.map(readJiraText).filter(Boolean).join("\n");
  if (typeof value !== "object") return "";

  const payload = value as { text?: unknown; content?: unknown };
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  const content = readJiraText(payload.content);
  return [text, content].filter(Boolean).join("\n");
}

function normalizeMaxIssues(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return 50;
  return Math.max(1, Math.min(100, Math.floor(value)));
}

function buildReadyJql(
  boardFilterId: number | undefined,
  statusName: string,
): string {
  const escapedStatusName = statusName
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
  const statusClause = `status = "${escapedStatusName}"`;
  if (!boardFilterId) return `${statusClause} ORDER BY updated ASC`;
  return `filter = ${boardFilterId} AND ${statusClause} ORDER BY updated ASC`;
}

const maxGitflowImageAttachments = 5;
const maxGitflowImageAttachmentBytes = 10 * 1024 * 1024;
const maxGitflowImageAttachmentTotalBytes = 20 * 1024 * 1024;
const supportedGitflowImageMimeTypes = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
