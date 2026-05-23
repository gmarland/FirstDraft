import { JiraClient } from "../../integrations/jira/jiraClient.js";
import { JiraIntegrationStore } from "../../store/integrations/jiraIntegrationStore.js";

export async function getClient(jiraIntegrations: JiraIntegrationStore, userId: string, integrationId: string): Promise<JiraClient> {
  const credentials = await jiraIntegrations.getCredentials(userId, integrationId);
  if (!credentials) throw new Error("Jira credentials are not configured");
  return new JiraClient(credentials);
}

export function buildReadyJql(boardFilterId: number | undefined, statusName: string): string {
  const escapedStatusName = statusName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const statusClause = `status = "${escapedStatusName}"`;
  if (!boardFilterId) return `${statusClause} ORDER BY updated ASC`;
  return `filter = ${boardFilterId} AND ${statusClause} ORDER BY updated ASC`;
}

export function logJiraIntakeRequest(event: string, details: Record<string, unknown>): void {
  console.log(`[jira-intake:route] ${event}`, details);
}
