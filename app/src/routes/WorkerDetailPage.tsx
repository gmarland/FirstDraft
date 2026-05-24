import { useCallback, useState } from "react";
import { Alert, Button, FormControlLabel, Stack, Switch } from "@mui/material";
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
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [updatingEnabled, setUpdatingEnabled] = useState(false);
  const [commandPage, setCommandPage] = useState(0);
  const [commandPageSize, setCommandPageSize] = useState(10);

  const loadState = useCallback(
    () => api.getWorkerState(token!, workerId),
    [workerId, token],
  );
  const loadCommands = useCallback(
    () => api.listCommands(token!, workerId, { page: commandPage, pageSize: commandPageSize }),
    [workerId, token, commandPage, commandPageSize],
  );
  const state = useAsyncData(loadState, [loadState]);
  const commands = useAsyncData(loadCommands, [loadCommands]);

  const updateEnabled = async (enabled: boolean) => {
    if (!token || updatingEnabled) return;

    setUpdatingEnabled(true);
    setToggleError(null);
    try {
      await api.updateWorker(token, workerId, { enabled });
      await Promise.all([state.refresh(), commands.refresh()]);
    } catch (caught) {
      setToggleError(
        caught instanceof Error
          ? caught.message
          : "Unable to update worker enabled state",
      );
    } finally {
      setUpdatingEnabled(false);
    }
  };

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
            <FormControlLabel
              control={
                <Switch
                  checked={state.data?.enabled ?? true}
                  onChange={(event) => void updateEnabled(event.target.checked)}
                  disabled={!state.data || updatingEnabled}
                />
              }
              label={state.data?.enabled === false ? "Disabled" : "Enabled"}
              sx={{ ml: { sm: 0.5 } }}
            />
          </Stack>
        }
      />

      {(state.error || commands.error || toggleError) && (
        <Alert severity="error">{state.error || commands.error || toggleError}</Alert>
      )}

      <WorkerSummaryGrid state={state.data ?? undefined} />

      <WorkerPanelsGrid
        workerId={workerId}
        commandDisabled={!state.data || state.data.state === "stopped"}
        commandDisabledReason={
          !state.data
            ? "Commands are disabled while the worker state loads."
            : state.data.state === "stopped"
              ? "Commands are disabled while the client is offline."
              : undefined
        }
        paths={state.data?.paths ?? []}
        skills={state.data?.skills ?? []}
        enabledTaskTypes={state.data?.enabledTaskTypes}
        onCommandQueued={async () => {
          if (commandPage !== 0) {
            setCommandPage(0);
            await state.refresh();
            return;
          }

          await Promise.all([state.refresh(), commands.refresh()]);
        }}
      />

      <CommandHistoryPanel
        workerId={workerId}
        commands={commands.data?.commands ?? []}
        total={commands.data?.total ?? 0}
        page={commandPage}
        pageSize={commandPageSize}
        loading={commands.loading}
        onPageChange={setCommandPage}
        onPageSizeChange={(nextPageSize) => {
          setCommandPageSize(nextPageSize);
          setCommandPage(0);
        }}
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
