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
import { WorkerRegistration } from "../../types.js";
import { isTaskTypeEnabled } from "../../commandModes.js";

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

export class JiraIntakeService {
  public constructor(
    private readonly jiraIntegrations: JiraIntegrationStore,
    private readonly intakeEvents: IntegrationIntakeEventStore,
    private readonly workers: WorkerStore,
    private readonly gitRepositories: GitRepositoryStore,
    private readonly dispatcher: CommandDispatcher,
  ) {}

  public async run(input: RunJiraIntakeInput): Promise<JiraIntakeResult> {
    const maxIssues = normalizeMaxIssues(input.maxIssues);
    logJiraIntake("run started", {
      userId: input.userId,
      integrationId: input.integrationId,
      requestedMaxIssues: input.maxIssues,
      maxIssues,
      dryRun: Boolean(input.dryRun),
    });
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
    const items: JiraIntakeResultItem[] = [];

    for (const integration of integrations) {
      const client = new JiraClient(integration);
      const jql = buildReadyJql(
        integration.boardFilterId,
        integration.readyStatusName,
      );
      logJiraIntake("searching ready issues", {
        userId: input.userId,
        integrationId: integration.id,
        siteUrl: integration.siteUrl,
        boardId: integration.boardId,
        boardName: integration.boardName,
        boardFilterId: integration.boardFilterId,
        readyStatusId: integration.readyStatusId,
        readyStatusName: integration.readyStatusName,
        maxIssues,
        jql,
      });

      const repositoryFieldKeys = await resolveRepositoryFieldKeys(client);
      logJiraIntake("repository fields resolved", {
        userId: input.userId,
        integrationId: integration.id,
        repositoryFieldKeys,
      });

      const issues = await client.searchIssues(jql, maxIssues, [
        "summary",
        "status",
        "description",
        "attachment",
        ...(repositoryFieldKeys.length ? repositoryFieldKeys : ["repository"]),
      ]);
      logJiraIntake("ready issues received", {
        userId: input.userId,
        integrationId: integration.id,
        issueCount: issues.length,
        issueKeys: issues.map((issue) => issue.key),
      });

      for (const issue of issues) {
        const item = await this.processIssue(
          integration.userId,
          integration,
          issue,
          ["repository", ...repositoryFieldKeys],
          Boolean(input.dryRun),
        );
        items.push(item);
        logJiraIntake("issue result", item);
      }
    }

    const result = {
      processed: items.length,
      queued: items.filter((item) => item.status === "queued").length,
      skipped: items.filter((item) => item.status === "skipped").length,
      failed: items.filter((item) => item.status === "failed").length,
      dryRun: Boolean(input.dryRun),
      items,
    };
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

  private async processIssue(
    userId: string,
    integration: JiraIntegrationCredentials,
    issue: JiraIssueSummary,
    repositoryFieldKeys: string[],
    dryRun: boolean,
  ): Promise<JiraIntakeResultItem> {
    logJiraIntake("processing issue", issue);
    const repositoryUrl = readRepositoryField(issue, repositoryFieldKeys);
    if (!repositoryUrl) {
      console.warn("[jira-intake] handling issue without repository", {
        userId,
        integrationId: integration.id,
        issueKey: issue.key,
        issueId: issue.id,
      });
      return handleMissingRepositoryIssue(integration, issue, dryRun);
    }

    const normalizedRepositoryUrl = normalizeRepositoryUrl(repositoryUrl);
    logJiraIntake("repository field read", {
      userId,
      integrationId: integration.id,
      issueKey: issue.key,
      repositoryUrl,
      normalizedRepositoryUrl,
    });
    if (dryRun) {
      logJiraIntake("dry-run issue would queue", {
        userId,
        integrationId: integration.id,
        issueKey: issue.key,
        repositoryUrl,
        normalizedRepositoryUrl,
      });
      return {
        integrationId: integration.id,
        issueKey: issue.key,
        issueId: issue.id,
        repositoryUrl,
        normalizedRepositoryUrl,
        status: "dry_run",
      };
    }

    const intake = await this.intakeEvents.begin({
      userId,
      provider: "jira",
      integrationId: integration.id,
      sourceItemId: issue.id,
      sourceItemKey: issue.key,
      repositoryUrl,
      normalizedRepositoryUrl,
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
        repositoryUrl,
        normalizedRepositoryUrl,
        workerId: intake.event.workerId,
        transactionId: intake.event.transactionId,
        status: "skipped",
        reason: `already ${intake.event.status}`,
      };
    }

    try {
      const repository = await this.gitRepositories.getRepository(
        userId,
        normalizedRepositoryUrl,
      );
      const sourceBranch =
        repository?.lastSourceBranch ||
        repository?.defaultSourceBranch ||
        "main";
      const targetBranch =
        repository?.defaultTargetBranch ||
        repository?.defaultSourceBranch ||
        sourceBranch;
      logJiraIntake("creating worker command", {
        userId,
        integrationId: integration.id,
        issueKey: issue.key,
        intakeEventId: intake.event.id,
        repositoryUrl,
        normalizedRepositoryUrl,
        repositoryConfigured: Boolean(repository),
        sourceBranch,
        targetBranch,
      });
      await this.gitRepositories.recordUserGitflowUsage({
        userId,
        repositoryUrl,
        sourceBranch,
      });
      const command = await this.workers.createQueuedCommand({
        userId,
        command: JSON.stringify({
          repositoryUrl,
          sourceBranch,
          targetBranch,
          ticketNumber: issue.key,
          ticketUrl: buildIssueUrl(integration.siteUrl, issue.key),
          title: issue.summary,
          description: readJiraText(issue.fields?.description),
          attachments: buildGitflowAttachments(integration.id, issue),
        }),
        repositoryUrl,
        normalizedRepositoryUrl,
        commandMode: "gitflow",
      });
      logJiraIntake("queued gitflow command", {
        userId,
        integrationId: integration.id,
        issueKey: issue.key,
        repositoryUrl,
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
        repositoryUrl,
        normalizedRepositoryUrl,
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
        repositoryUrl,
        normalizedRepositoryUrl,
        status: "failed",
        reason,
      };
    }
  }
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
  integrationId: string,
  issue: JiraIssueSummary,
): GitflowJiraAttachment[] {
  return readImageAttachments(issue)
    .slice(0, maxGitflowImageAttachments)
    .map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
      downloadUrl: `/api/worker-auth/jira-attachments/${encodeURIComponent(integrationId)}/${encodeURIComponent(issue.id)}/${encodeURIComponent(attachment.id)}`,
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

function isAvailableGitWorker(worker: WorkerRegistration): boolean {
  return (
    worker.state !== "stopped" &&
    worker.enabled &&
    isTaskTypeEnabled(worker.enabledTaskTypes, "gitflow") &&
    worker.skills.map((skill) => skill.toLowerCase()).includes("git") &&
    activeTaskCount(worker) < maxConcurrentTasks(worker)
  );
}

function activeTaskCount(worker: WorkerRegistration): number {
  return (
    worker.activeTaskCount ??
    worker.activeTransactionIds?.length ??
    (worker.currentTransactionId ? 1 : 0)
  );
}

function maxConcurrentTasks(worker: WorkerRegistration): number {
  return Math.max(1, worker.maxConcurrentTasks ?? 1);
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
