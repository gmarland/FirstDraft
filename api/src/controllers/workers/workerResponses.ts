import { Response } from "express";
import { Readable } from "stream";
import { CommandOutputStorage } from "../../storage/commandOutputStorage.js";
import { GitRepositorySuggestion } from "../../store/gitRepositories/gitRepositoryStore.js";
import { JiraIntegrationSettings } from "../../store/integrations/jiraIntegrationStore.js";
import { Command, WorkerRegistration } from "../../types.js";

export type WorkerJiraIntegrationResponse = {
  provider: "jira";
  id: string;
  connected: boolean;
  enabled: boolean;
  siteUrl: string;
  boardName: string;
  boardType: string;
  readyStatusName: string;
  processingStatusName: string;
  processedStatusName: string;
  assigneeCount: number;
  updatedAt?: string;
};

export function toWorkerStateResponse(
  client: WorkerRegistration,
  gitRepositories: GitRepositorySuggestion[] = [],
  jiraIntegrations: JiraIntegrationSettings[] = []
) {
  return {
    workerId: client.workerId,
    userId: client.userId,
    connectionId: client.connectionId,
    paths: client.paths,
    gitRepositories,
    jiraIntegrations: jiraIntegrations.map(toWorkerJiraIntegrationResponse),
    skills: client.skills,
    enabledTaskTypes: client.enabledTaskTypes,
    state: client.state,
    currentTransactionId: client.currentTransactionId,
    activeTransactionIds: client.activeTransactionIds ?? (client.currentTransactionId ? [client.currentTransactionId] : []),
    maxConcurrentTasks: client.maxConcurrentTasks ?? null,
    activeTaskCount: client.activeTaskCount ?? (client.activeTransactionIds ?? (client.currentTransactionId ? [client.currentTransactionId] : [])).length,
    registeredAt: client.registeredAt,
    firstRegisteredAt: client.firstRegisteredAt,
    lastRegisteredAt: client.lastRegisteredAt,
    lastSeenAt: client.lastSeenAt,
    stateUpdatedAt: client.stateUpdatedAt,
    stoppedAt: client.stoppedAt,
    archivedAt: client.archivedAt
  };
}

function toWorkerJiraIntegrationResponse(
  integration: JiraIntegrationSettings
): WorkerJiraIntegrationResponse {
  return {
    provider: "jira",
    id: integration.id,
    connected: integration.connected,
    enabled: integration.enabled,
    siteUrl: integration.siteUrl,
    boardName: integration.boardName,
    boardType: integration.boardType,
    readyStatusName: integration.readyStatusName,
    processingStatusName: integration.processingStatusName,
    processedStatusName: integration.processedStatusName,
    assigneeCount: integration.assignees.length,
    updatedAt: integration.updatedAt
  };
}

export async function streamCommandOutput(
  command: Command,
  res: Response,
  outputStorage?: CommandOutputStorage
): Promise<void> {
  if (!command.outputObjectKey) {
    res.status(404).json({ error: "command output not found" });
    return;
  }

  if (!outputStorage) {
    res.status(503).json({ error: "command output storage is not configured" });
    return;
  }

  const output = await outputStorage.getOutput(command.outputObjectKey);
  res.setHeader("content-type", output.contentType ?? "worker/x-ndjson");
  output.body.pipe(res);
}

export async function sendCommandResponses(
  command: Command,
  res: Response,
  outputStorage?: CommandOutputStorage
): Promise<void> {
  if (!command.outputObjectKey) {
    res.json({ command, responses: [] });
    return;
  }

  if (!outputStorage) {
    res.status(503).json({ error: "command output storage is not configured" });
    return;
  }

  const output = await outputStorage.getOutput(command.outputObjectKey);
  res.json({
    command,
    responses: await readNdjson(output.body)
  });
}

async function readNdjson(body: Readable): Promise<unknown[]> {
  body.setEncoding("utf8");

  let pending = "";
  const rows: unknown[] = [];
  for await (const chunk of body) {
    pending += chunk;
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";

    for (const line of lines) {
      if (line.trim()) rows.push(JSON.parse(line));
    }
  }

  if (pending.trim()) {
    rows.push(JSON.parse(pending));
  }

  return rows;
}
