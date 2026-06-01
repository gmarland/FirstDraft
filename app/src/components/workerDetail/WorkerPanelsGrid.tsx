import { Box, Stack, Typography } from "@mui/material";
import { RegisteredIntegrationsPanel } from "./RegisteredIntegrationsPanel";
import { RegisteredPathsPanel } from "./RegisteredPathsPanel";
import { RegisteredRepositoriesPanel } from "./RegisteredRepositoriesPanel";
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
  );
}
