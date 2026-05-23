import { useCallback, useMemo } from "react";
import { Alert, Button, Stack } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import RefreshIcon from "@mui/icons-material/Refresh";
import { WorkerPanelsGrid } from "../components/workerDetail/WorkerPanelsGrid";
import { WorkerSummaryGrid } from "../components/workerDetail/WorkerSummaryGrid";
import { CommandHistoryPanel } from "../components/workerDetail/CommandHistoryPanel";
import { PageHeader } from "../components/PageHeader";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAsyncData } from "../lib/useAsyncData";

type Props = {
  workerId: string;
  onBackToWorkers(): void;
};

export function WorkerDetailPage({ workerId, onBackToWorkers }: Props) {
  const { token } = useAuth();

  const loadState = useCallback(
    () => api.getWorkerState(token!, workerId),
    [workerId, token],
  );
  const loadCommands = useCallback(
    () => api.listCommands(token!, workerId),
    [workerId, token],
  );
  const state = useAsyncData(loadState, [loadState]);
  const commands = useAsyncData(loadCommands, [loadCommands]);

  const sortedCommands = useMemo(
    () =>
      [...(commands.data ?? [])].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [commands.data],
  );

  return (
    <Stack spacing={2.75}>
      <PageHeader
        title={workerId}
        actions={
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button
              variant="outlined"
              startIcon={<ArrowBackIcon />}
              onClick={onBackToWorkers}
            >
              Back to workers
            </Button>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={() =>
                void Promise.all([state.refresh(), commands.refresh()])
              }
            >
              Refresh
            </Button>
          </Stack>
        }
      />

      {(state.error || commands.error) && (
        <Alert severity="error">{state.error || commands.error}</Alert>
      )}

      <WorkerSummaryGrid state={state.data ?? undefined} />

      <WorkerPanelsGrid
        workerId={workerId}
        commandDisabled={state.data?.state === "stopped"}
        paths={state.data?.paths ?? []}
        skills={state.data?.skills ?? []}
        onCommandQueued={async () => {
          await Promise.all([state.refresh(), commands.refresh()]);
        }}
      />

      <CommandHistoryPanel
        workerId={workerId}
        commands={sortedCommands}
        loading={commands.loading}
        onCommandChanged={async () => {
          await Promise.all([state.refresh(), commands.refresh()]);
        }}
      />

      <Button
        variant="outlined"
        startIcon={<ContentCopyIcon />}
        onClick={() => void navigator.clipboard.writeText(workerId)}
        sx={{ alignSelf: "flex-start" }}
      >
        Copy worker ID
      </Button>
    </Stack>
  );
}
