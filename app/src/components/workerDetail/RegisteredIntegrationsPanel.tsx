import { Divider, Stack, Typography } from "@mui/material";
import { formatDate, relativeTime } from "../../lib/dates";
import type { WorkerJiraIntegration } from "../../types/api";
import {
  RegisteredResourceItem,
  RegisteredResourcePanel,
  ResourceField,
} from "./RegisteredResourcePanel";

type Props = {
  integrations: WorkerJiraIntegration[];
};

export function RegisteredIntegrationsPanel({ integrations }: Props) {
  return (
    <RegisteredResourcePanel
      caption="Integrations"
      empty={integrations.length === 0}
      emptyMessage="No integrations reported by this worker."
    >
      {integrations.map((integration) => (
        <RegisteredResourceItem key={`${integration.provider}-${integration.id}`}>
          <Stack spacing={1}>
            <ResourceField value={integration.siteUrl} />
            <ResourceField
              label="Board"
              value={`${integration.boardName}${integration.boardType ? ` (${integration.boardType})` : ""}`}
            />
            <Divider />
            <Stack spacing={0.5}>
              <ResourceField label="Ready" value={integration.readyStatusName} />
              <ResourceField
                label="Processing"
                value={integration.processingStatusName}
              />
              <ResourceField
                label="Processed"
                value={integration.processedStatusName}
              />
              <ResourceField
                label="Assignees"
                value={String(integration.assigneeCount)}
              />
            </Stack>
            {integration.updatedAt && (
              <Typography
                variant="caption"
                color="text.secondary"
                title={formatDate(integration.updatedAt)}
              >
                Updated {relativeTime(integration.updatedAt)}
              </Typography>
            )}
          </Stack>
        </RegisteredResourceItem>
      ))}
    </RegisteredResourcePanel>
  );
}
