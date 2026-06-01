import { Box, Chip, Divider, Paper, Stack, Typography } from "@mui/material";
import { RegisteredPathsPanel } from "./RegisteredPathsPanel";
import { formatDate, relativeTime } from "../../lib/dates";
import type {
  GitRepositorySuggestion,
  WorkerJiraIntegration,
} from "../../types/api";

type Props = {
  paths: string[];
  gitRepositories: GitRepositorySuggestion[];
  jiraIntegrations: WorkerJiraIntegration[];
};

export function WorkerPanelsGrid({
  paths,
  gitRepositories,
  jiraIntegrations,
}: Props) {
  return (
    <Stack spacing={1.5}>
      <Box>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontWeight: 800 }}
        >
          Registry
        </Typography>
        <Typography variant="h2">Registered resources</Typography>
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "repeat(3, minmax(0, 1fr))" },
          gap: 2,
        }}
      >
        <RegisteredPathsPanel paths={paths} />
        <RegisteredRepositoriesPanel repositories={gitRepositories} />
        <RegisteredIntegrationsPanel integrations={jiraIntegrations} />
      </Box>
    </Stack>
  );
}

function RegisteredRepositoriesPanel({
  repositories,
}: {
  repositories: GitRepositorySuggestion[];
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <PanelTitle caption="Git" />
        <Stack spacing={1}>
          {repositories.map((repository) => (
            <Paper
              variant="outlined"
              key={repository.normalizedRepositoryUrl}
              sx={{ p: 1.25, bgcolor: "background.default" }}
            >
              <Stack spacing={1}>
                <Typography component="code" className="wrap-code">
                  {repository.repositoryUrl}
                </Typography>
                <Stack
                  direction="row"
                  spacing={0.75}
                  useFlexGap
                  sx={{ flexWrap: "wrap" }}
                >
                  <Chip
                    size="small"
                    label={`Source ${repository.sourceBranch}`}
                  />
                  <Chip
                    size="small"
                    label={`Target ${repository.targetBranch}`}
                  />
                </Stack>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  title={formatDate(repository.lastUsedAt)}
                >
                  Last registered {relativeTime(repository.lastUsedAt)}
                </Typography>
              </Stack>
            </Paper>
          ))}
          {repositories.length === 0 && (
            <Typography color="text.secondary">
              No repositories reported by this worker.
            </Typography>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}

function RegisteredIntegrationsPanel({
  integrations,
}: {
  integrations: WorkerJiraIntegration[];
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <PanelTitle caption="Integrations" />
        <Stack spacing={1}>
          {integrations.map((integration) => (
            <Paper
              variant="outlined"
              key={`${integration.provider}-${integration.id}`}
              sx={{ p: 1.25, bgcolor: "background.default" }}
            >
              <Stack spacing={1}>
                <ResourceField value={integration.siteUrl} />
                <ResourceField
                  label="Board"
                  value={`${integration.boardName}${integration.boardType ? ` (${integration.boardType})` : ""}`}
                />
                <Divider />
                <Stack spacing={0.5}>
                  <ResourceField
                    label="Ready"
                    value={integration.readyStatusName}
                  />
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
            </Paper>
          ))}
          {integrations.length === 0 && (
            <Typography color="text.secondary">
              No integrations reported by this worker.
            </Typography>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}

function PanelTitle({ caption, title }: { caption: string; title?: string }) {
  return (
    <Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontWeight: 800 }}
      >
        {caption}
      </Typography>
      {title && <Typography variant="h2">{title}</Typography>}
    </Box>
  );
}

function ResourceField({
  label,
  value,
  code = false,
}: {
  label?: string;
  value: string;
  code?: boolean;
}) {
  return (
    <Box>
      {label && (
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      )}
      <Typography
        component={code ? "code" : "div"}
        className={code ? "wrap-code" : undefined}
        sx={{ fontWeight: code ? 400 : 700 }}
      >
        {value || "-"}
      </Typography>
    </Box>
  );
}
