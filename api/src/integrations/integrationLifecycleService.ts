import { Command } from "../types.js";
import { JiraClient } from "./jira/jiraClient.js";
import { JiraIntegrationStore } from "../store/integrations/jiraIntegrationStore.js";
import {
  IntegrationIntakeEvent,
  IntegrationIntakeEventStore,
} from "../store/integrations/integrationIntakeEventStore.js";

type JiraLifecycleStage = "processing" | "processed";

type GitflowResultDetails = {
  branch?: string;
  commit?: string;
  pullRequest?: string;
  aiSummary?: string;
};

export class IntegrationLifecycleService {
  public constructor(
    private readonly intakeEvents: IntegrationIntakeEventStore,
    private readonly jiraIntegrations: JiraIntegrationStore,
  ) {}

  public async commandStarted(command: Command): Promise<void> {
    await this.transitionJiraIssue(command.transactionId, "processing");
  }

  public async commandCompleted(command: Command): Promise<void> {
    await this.handleJiraCompletion(command);
  }

  private async transitionJiraIssue(
    transactionId: string,
    stage: JiraLifecycleStage,
  ): Promise<void> {
    const event = await this.intakeEvents.getByTransactionId(transactionId);
    if (!event || event.provider !== "jira") return;

    const credentials = await this.jiraIntegrations.getCredentials(
      event.userId,
      event.integrationId,
    );
    if (!credentials) {
      console.warn("[integration-lifecycle] skipping Jira transition without credentials", {
        eventId: event.id,
        transactionId,
        integrationId: event.integrationId,
        issueKey: event.sourceItemKey,
        stage,
      });
      return;
    }

    const targetStatusId =
      stage === "processing"
        ? credentials.processingStatusId
        : credentials.processedStatusId;
    const targetStatusName =
      stage === "processing"
        ? credentials.processingStatusName
        : credentials.processedStatusName;

    if (!targetStatusId || !targetStatusName) {
      console.warn("[integration-lifecycle] skipping Jira transition without configured status", {
        eventId: event.id,
        transactionId,
        integrationId: event.integrationId,
        issueKey: event.sourceItemKey,
        stage,
      });
      return;
    }

    try {
      const transition = await new JiraClient(credentials).transitionIssue(
        event.sourceItemKey,
        targetStatusId,
        targetStatusName,
      );
      await this.markEventStage(event, stage);
      console.log("[integration-lifecycle] Jira issue transitioned", {
        eventId: event.id,
        transactionId,
        integrationId: event.integrationId,
        issueKey: event.sourceItemKey,
        stage,
        transitionId: transition.id,
        transitionName: transition.name,
        targetStatusId,
        targetStatusName,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error("[integration-lifecycle] Jira transition failed", {
        eventId: event.id,
        transactionId,
        integrationId: event.integrationId,
        issueKey: event.sourceItemKey,
        stage,
        targetStatusId,
        targetStatusName,
        reason,
      });
    }
  }

  private async markEventStage(
    event: IntegrationIntakeEvent,
    stage: JiraLifecycleStage,
  ): Promise<void> {
    if (stage === "processing") {
      await this.intakeEvents.markProcessing(event.id);
      return;
    }

    await this.intakeEvents.markProcessed(event.id);
  }

  private async handleJiraCompletion(command: Command): Promise<void> {
    const event = await this.intakeEvents.getByTransactionId(
      command.transactionId,
    );
    if (!event || event.provider !== "jira") return;

    const credentials = await this.jiraIntegrations.getCredentials(
      event.userId,
      event.integrationId,
    );
    if (!credentials) {
      console.warn("[integration-lifecycle] skipping Jira completion without credentials", {
        eventId: event.id,
        transactionId: command.transactionId,
        integrationId: event.integrationId,
        issueKey: event.sourceItemKey,
        status: command.status,
      });
      if (command.status === "failed") {
        await this.intakeEvents.markFailed(
          event.id,
          command.errorMessage ?? "Gitflow command failed.",
        );
      }
      return;
    }

    const jira = new JiraClient(credentials);
    if (command.status === "completed") {
      await this.addJiraCompletionComment(jira, event, command);
      await this.transitionJiraIssue(command.transactionId, "processed");
      return;
    }

    if (command.status === "failed") {
      await this.addJiraFailureComment(jira, event, command);
      await this.intakeEvents.markFailed(
        event.id,
        command.errorMessage ?? "Gitflow command failed.",
      );
    }
  }

  private async addJiraCompletionComment(
    jira: JiraClient,
    event: IntegrationIntakeEvent,
    command: Command,
  ): Promise<void> {
    const details = parseGitflowResult(command.result ?? "");
    const summary = extractChangeSummary(
      details.aiSummary || command.agentResponse || command.result || "",
    );
    const lines = [
      "FirstDraft completed this gitflow task.",
      details.pullRequest ? `Pull request: ${details.pullRequest}` : undefined,
      details.branch ? `Branch: ${details.branch}` : undefined,
      details.commit ? `Commit: ${details.commit}` : undefined,
      summary ? "" : undefined,
      summary ? "Summary:" : undefined,
      summary ? truncateCommentSection(summary) : undefined,
    ].filter((line): line is string => line !== undefined);

    await this.addJiraComment(jira, event, command, lines.join("\n"));
  }

  private async addJiraFailureComment(
    jira: JiraClient,
    event: IntegrationIntakeEvent,
    command: Command,
  ): Promise<void> {
    const reason = command.errorMessage || "Gitflow command failed.";
    await this.addJiraComment(
      jira,
      event,
      command,
      [
        "FirstDraft could not complete this gitflow task.",
        "",
        "Reason:",
        truncateCommentSection(reason),
      ].join("\n"),
    );
  }

  private async addJiraComment(
    jira: JiraClient,
    event: IntegrationIntakeEvent,
    command: Command,
    body: string,
  ): Promise<void> {
    try {
      await jira.addComment(event.sourceItemKey, truncateJiraComment(body));
      console.log("[integration-lifecycle] Jira issue commented", {
        eventId: event.id,
        transactionId: command.transactionId,
        integrationId: event.integrationId,
        issueKey: event.sourceItemKey,
        status: command.status,
      });
    } catch (error) {
      console.error("[integration-lifecycle] Jira comment failed", {
        eventId: event.id,
        transactionId: command.transactionId,
        integrationId: event.integrationId,
        issueKey: event.sourceItemKey,
        status: command.status,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function parseGitflowResult(result: string): GitflowResultDetails {
  const details: GitflowResultDetails = {};
  const lines = result.replace(/\r\n/g, "\n").split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith("Branch:")) {
      details.branch = line.slice("Branch:".length).trim() || undefined;
    } else if (line.startsWith("Commit:")) {
      details.commit = line.slice("Commit:".length).trim() || undefined;
    } else if (line.startsWith("Pull request:")) {
      details.pullRequest =
        line.slice("Pull request:".length).trim() || undefined;
    } else if (line.trim() === "AI summary:") {
      details.aiSummary = lines.slice(i + 1).join("\n").trim() || undefined;
      break;
    }
  }

  return details;
}

function truncateCommentSection(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= maxJiraCommentSectionCharacters) return normalized;
  return `${normalized.slice(0, maxJiraCommentSectionCharacters).trimEnd()}\n...`;
}

function extractChangeSummary(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";

  const summary = extractMarkdownSection(normalized, ["PR Summary", "Summary"]);
  if (summary) return summary;

  const execution = textAfterLastDelimiter(normalized, "----- Execution -----");
  const lines: string[] = [];
  for (const rawLine of execution.split("\n")) {
    const line = rawLine.trim();
    if (isHeading(line, ["Tests", "Testing"])) break;
    if (!line || line.startsWith("```")) continue;
    lines.push(line);
    if (lines.length >= 6) break;
  }

  return lines.join("\n");
}

function extractMarkdownSection(
  value: string,
  headings: readonly string[],
): string {
  const lines = value.split("\n");
  let start = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (isHeading(lines[index], headings)) {
      start = index + 1;
      break;
    }
  }

  if (start < 0) return "";

  let end = lines.length;
  for (let index = start; index < lines.length; index += 1) {
    if (normalizeHeading(lines[index])) {
      end = index;
      break;
    }
  }

  return lines.slice(start, end).join("\n").trim();
}

function isHeading(line: string, headings: readonly string[]): boolean {
  const normalized = normalizeHeading(line);
  return headings.some(
    (heading) => normalized.toLowerCase() === heading.toLowerCase(),
  );
}

function normalizeHeading(line: string): string {
  const normalized = line
    .trim()
    .replace(/^#+/, "")
    .trim()
    .replace(/^\*+|\*+$/g, "")
    .trim();
  if (!normalized.endsWith(":")) return "";
  const heading = normalized.slice(0, -1).trim();
  if (heading.length > 80 || heading.includes(".") || heading.includes(",")) {
    return "";
  }
  return heading;
}

function textAfterLastDelimiter(value: string, delimiter: string): string {
  const index = value.lastIndexOf(delimiter);
  if (index < 0) return value;
  return value.slice(index + delimiter.length);
}

function truncateJiraComment(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= maxJiraCommentCharacters) return normalized;
  return `${normalized.slice(0, maxJiraCommentCharacters).trimEnd()}\n...`;
}

const maxJiraCommentSectionCharacters = 4000;
const maxJiraCommentCharacters = 8000;
