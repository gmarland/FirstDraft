import { useCallback, useState } from "react";
import { Alert, Box, Button, Stack, Tab, Tabs } from "@mui/material";
import ArchiveIcon from "@mui/icons-material/Archive";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import FolderSpecialIcon from "@mui/icons-material/FolderSpecial";
import HistoryIcon from "@mui/icons-material/History";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  CommandHistoryPanel,
  WorkerPanelsGrid,
  WorkerSummaryGrid,
} from "../components/workerDetail";
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog";
import { PageHeader } from "../components/PageHeader";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAsyncData } from "../lib/useAsyncData";

type Props = {
  workerId: string;
  onBackToWorkers(): void;
};

type WorkerDetailTab = "history" | "resources";

export function WorkerDetailPage({ workerId, onBackToWorkers }: Props) {
  const { token } = useAuth();
  const [commandPage, setCommandPage] = useState(0);
  const [commandPageSize, setCommandPageSize] = useState(10);
  const [tab, setTab] = useState<WorkerDetailTab>("history");
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

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
  const canArchive = state.data?.state === "started";

  const confirmArchive = async () => {
    setArchiveError(null);
    setArchiving(true);

    try {
      await api.archiveWorker(token!, workerId);
      setArchiveDialogOpen(false);
      onBackToWorkers();
    } catch (caught) {
      setArchiveError(caught instanceof Error ? caught.message : "Unable to archive worker");
    } finally {
      setArchiving(false);
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
            {canArchive && (
              <Button
                variant="outlined"
                color="error"
                startIcon={<ArchiveIcon />}
                onClick={() => {
                  setArchiveError(null);
                  setArchiveDialogOpen(true);
                }}
              >
                Archive
              </Button>
            )}
          </Stack>
        }
      />

      {(state.error || commands.error) && (
        <Alert severity="error">{state.error || commands.error}</Alert>
      )}
      {archiveError && <Alert severity="error">{archiveError}</Alert>}

      <WorkerSummaryGrid state={state.data ?? undefined} />

      <Box
        sx={{
          alignSelf: "flex-start",
          border: 1,
          borderColor: "divider",
          bgcolor: "background.default",
          borderRadius: 2,
          p: 0.5,
        }}
      >
        <Tabs
          value={tab}
          onChange={(_event, value: WorkerDetailTab) => setTab(value)}
          aria-label="Worker detail sections"
          sx={{
            minHeight: 0,
            "& .MuiTabs-indicator": {
              display: "none",
            },
            "& .MuiTabs-flexContainer": {
              gap: 0.5,
            },
            "& .MuiTab-root": {
              minHeight: 0,
              px: 1.5,
              py: 0.75,
              borderRadius: 1.5,
              color: "text.secondary",
              fontWeight: 800,
            },
            "& .Mui-selected": {
              bgcolor: "background.paper",
              color: "text.primary",
              boxShadow: "0 1px 3px rgba(23, 32, 38, 0.12)",
            },
          }}
        >
          <Tab
            icon={<HistoryIcon />}
            iconPosition="start"
            label="Command history"
            value="history"
          />
          <Tab
            icon={<FolderSpecialIcon />}
            iconPosition="start"
            label="Registered resources"
            value="resources"
          />
        </Tabs>
      </Box>

      {tab === "history" ? (
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
      ) : (
        <WorkerPanelsGrid
          paths={state.data?.paths ?? []}
          gitRepositories={state.data?.gitRepositories ?? []}
          jiraIntegrations={state.data?.jiraIntegrations ?? []}
        />
      )}

      <Button
        variant="outlined"
        startIcon={<ContentCopyIcon />}
        onClick={() => void navigator.clipboard.writeText(workerId)}
        sx={{ alignSelf: "flex-start" }}
      >
        Copy worker ID
      </Button>

      <DeleteConfirmationDialog
        open={archiveDialogOpen}
        title="Archive worker?"
        description="This worker will be archived until it connects again. It will be hidden from the workers list, but task history for work it has already completed will remain available."
        confirmLabel="Archive worker"
        submittingLabel="Archiving"
        confirmIcon={<ArchiveIcon />}
        submitting={archiving}
        onClose={() => {
          if (!archiving) setArchiveDialogOpen(false);
        }}
        onConfirm={() => void confirmArchive()}
      />
    </Stack>
  );
}
