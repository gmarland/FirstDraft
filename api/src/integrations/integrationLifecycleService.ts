import { Command } from "../types.js";
import { IntegrationIntakeEventStore } from "../store/integrations/integrationIntakeEventStore.js";
import { GitRepositoryStore } from "../store/gitRepositories/gitRepositoryStore.js";

export class IntegrationLifecycleService {
  public constructor(
    private readonly intakeEvents: IntegrationIntakeEventStore,
    private readonly gitRepositories?: GitRepositoryStore,
  ) {}

  public async commandStarted(command: Command): Promise<void> {
    await this.recordAssignedRepositoryUsage(command);
    await this.markJiraEventProcessing(command);
  }

  public async commandCompleted(command: Command): Promise<void> {
    const event = await this.intakeEvents.getByTransactionId(command.transactionId);
    if (!event || event.provider !== "jira") return;

    if (command.status === "completed") {
      await this.intakeEvents.markProcessed(event.id);
      return;
    }

    if (command.status === "failed") {
      await this.intakeEvents.markFailed(
        event.id,
        command.errorMessage ?? "Gitflow command failed.",
      );
    }
  }

  private async markJiraEventProcessing(command: Command): Promise<void> {
    const event = await this.intakeEvents.getByTransactionId(command.transactionId);
    if (!event || event.provider !== "jira") return;

    await this.intakeEvents.markProcessing(event.id, command.workerId);
  }

  private async recordAssignedRepositoryUsage(command: Command): Promise<void> {
    if (!this.gitRepositories || !command.workerId) return;

    const repositoryUrl = command.repositoryUrl ?? readGitflowPayloadString(command.command, "repositoryUrl");
    if (!repositoryUrl) return;

    try {
      await this.gitRepositories.touchWorkerRepository(command.workerId, repositoryUrl);
    } catch (error) {
      console.error("[integration-lifecycle] failed recording worker repository usage", {
        transactionId: command.transactionId,
        workerId: command.workerId,
        repositoryUrl,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function readGitflowPayloadString(command: string, key: string): string | undefined {
  try {
    const payload = JSON.parse(command) as Record<string, unknown>;
    const value = payload[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}
