import { Box } from "@mui/material";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useAsyncData } from "../../lib/useAsyncData";
import { QuickCommandPanel } from "./QuickCommandPanel";
import { RegisteredPathsPanel } from "./RegisteredPathsPanel";

type Props = {
  workerId: string;
  commandDisabled: boolean;
  paths: string[];
  skills: string[];
  onCommandQueued(): Promise<void>;
};

export function WorkerPanelsGrid({ workerId, commandDisabled, paths, skills, onCommandQueued }: Props) {
  const { token } = useAuth();
  const { data: gitflowSuggestions, refresh: refreshGitflowSuggestions } = useAsyncData(
    () => api.getGitflowSuggestions(token!, workerId),
    [workerId, token]
  );

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0, 7fr) minmax(0, 5fr)" }, gap: 2 }}>
      <QuickCommandPanel
        disabled={commandDisabled}
        supportedSkills={skills}
        gitRepositorySuggestions={gitflowSuggestions?.repositories ?? []}
        onSubmit={async (command, commandMode) => {
          await api.createCommand(token!, workerId, command, commandMode);
          if (commandMode === "gitflow") await refreshGitflowSuggestions();
          await onCommandQueued();
        }}
      />
      <RegisteredPathsPanel paths={paths} />
    </Box>
  );
}
