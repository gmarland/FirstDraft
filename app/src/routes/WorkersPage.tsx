import { MouseEvent, useCallback, useState } from "react";
import {
  Alert,
  Box,
  Button,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Tooltip,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import RefreshIcon from "@mui/icons-material/Refresh";
import { DisableAllWorkersDialog } from "../components/workers/actions/DisableAllWorkersDialog";
import { TaskQueuePanel } from "../components/workers/TaskQueuePanel";
import { WorkersTable } from "../components/workers/table/WorkersTable";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAsyncData } from "../lib/useAsyncData";
import type { CommandStatus, TaskQueueSortBy, TaskQueueSortDirection } from "../types/api";

type Props = {
  navigate(to: string): void;
};

type WorkersTab = "workers" | "taskQueue";

type TaskQueueSort = {
  sortBy?: TaskQueueSortBy;
  sortDirection?: TaskQueueSortDirection;
};

export function WorkersPage({ navigate }: Props) {
  const { token, user } = useAuth();
  const [activeTab, setActiveTab] = useState<WorkersTab>("workers");
  const [actionsMenuAnchor, setActionsMenuAnchor] =
    useState<HTMLElement | null>(null);
  const [disableAllDialogOpen, setDisableAllDialogOpen] = useState(false);
  const [disableAllError, setDisableAllError] = useState<string | null>(null);
  const [disablingAll, setDisablingAll] = useState(false);
  const [queuePage, setQueuePage] = useState(0);
  const [queuePageSize, setQueuePageSize] = useState(10);
  const [queueStatuses, setQueueStatuses] = useState<CommandStatus[]>([
    "queued",
    "in_progress",
  ]);
  const [queueSort, setQueueSort] = useState<TaskQueueSort>({
    sortDirection: "asc",
  });
  const load = useCallback(() => api.listWorkers(token!), [token]);
  const loadQueue = useCallback(
    () => api.listTaskQueue(token!, {
      page: queuePage,
      pageSize: queuePageSize,
      statuses: queueStatuses,
      sortBy: queueSort.sortBy,
      sortDirection: queueSort.sortDirection,
    }),
    [token, queuePage, queuePageSize, queueStatuses, queueSort],
  );
  const {
    data: workers,
    error,
    loading,
    refresh,
  } = useAsyncData(load, [load]);
  const {
    data: taskQueue,
    error: queueError,
    loading: queueLoading,
    refresh: refreshQueue,
  } = useAsyncData(loadQueue, [loadQueue]);
  const hasEnabledWorkers = workers?.some((worker) => worker.enabled) ?? false;
  const actionsMenuOpen = Boolean(actionsMenuAnchor);

  const openActionsMenu = (event: MouseEvent<HTMLElement>) => {
    setActionsMenuAnchor(event.currentTarget);
  };

  const closeActionsMenu = () => {
    setActionsMenuAnchor(null);
  };

  const closeDisableAllDialog = () => {
    if (!disablingAll) {
      setDisableAllDialogOpen(false);
    }
  };

  const disableAllWorkers = async () => {
    if (!token || disablingAll) return;

    setDisablingAll(true);
    setDisableAllError(null);
    try {
      await api.disableAllWorkers(token);
      await Promise.all([refresh(), refreshQueue()]);
      setDisableAllDialogOpen(false);
    } catch (caught) {
      setDisableAllError(
        caught instanceof Error
          ? caught.message
          : "Unable to disable all workers",
      );
    } finally {
      setDisablingAll(false);
    }
  };

  const disableAllWorkersFromMenu = () => {
    closeActionsMenu();
    setDisableAllDialogOpen(true);
  };

  const refreshActiveTab = () => {
    if (activeTab === "taskQueue") {
      return refreshQueue();
    }

    return refresh();
  };

  return (
    <Stack spacing={2.75}>
      <PageHeader
        title="Workers"
        actions={
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={() => void refreshActiveTab()}
            >
              Refresh
            </Button>
            {activeTab === "workers" && (
              <>
                <Tooltip title="Worker actions">
                  <span>
                    <IconButton
                      aria-label="Worker actions"
                      aria-controls={
                        actionsMenuOpen ? "worker-actions-menu" : undefined
                      }
                      aria-haspopup="menu"
                      aria-expanded={actionsMenuOpen ? "true" : undefined}
                      onClick={openActionsMenu}
                      disabled={!workers}
                    >
                      <MoreVertIcon />
                    </IconButton>
                  </span>
                </Tooltip>
                <Menu
                  id="worker-actions-menu"
                  anchorEl={actionsMenuAnchor}
                  open={actionsMenuOpen}
                  onClose={closeActionsMenu}
                  anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                  transformOrigin={{ vertical: "top", horizontal: "right" }}
                >
                  <MenuItem
                    onClick={disableAllWorkersFromMenu}
                    disabled={!hasEnabledWorkers || disablingAll}
                  >
                    <ListItemIcon>
                      <PowerSettingsNewIcon fontSize="small" color="error" />
                    </ListItemIcon>
                    <ListItemText>Disable all workers</ListItemText>
                  </MenuItem>
                </Menu>
              </>
            )}
          </Stack>
        }
      />

      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs
          value={activeTab}
          onChange={(_, value: WorkersTab) => setActiveTab(value)}
          aria-label="Workers page tabs"
        >
          <Tab value="workers" label="Workers" />
          <Tab value="taskQueue" label="Task queue" />
        </Tabs>
      </Box>

      {activeTab === "workers" && (
        <>
          <DisableAllWorkersDialog
            open={disableAllDialogOpen}
            onClose={closeDisableAllDialog}
            onConfirm={() => void disableAllWorkers()}
            disabled={!hasEnabledWorkers}
            submitting={disablingAll}
          />

          {(error || disableAllError) && (
            <Alert severity="error">{error || disableAllError}</Alert>
          )}
          {loading && !workers && <Skeleton variant="rounded" height={220} />}

          {workers && workers.length === 0 && (
            <EmptyState title="No client workers are registered">
              Run firstdraft init, log in, configure the client worker, and start it.
              Registered clients will appear here.
            </EmptyState>
          )}

          {workers && workers.length > 0 && (
            <WorkersTable
              workers={workers}
              onSelect={(workerId) =>
                navigate(`/workers/${encodeURIComponent(workerId)}`)
              }
            />
          )}
        </>
      )}

      {activeTab === "taskQueue" && (
        <>
          {queueError && <Alert severity="error">{queueError}</Alert>}
          {queueLoading && !taskQueue && <Skeleton variant="rounded" height={260} />}
          {taskQueue && (
            <TaskQueuePanel
              currentUserId={user?.userId}
              commands={taskQueue.commands}
              total={taskQueue.total}
              page={queuePage}
              pageSize={queuePageSize}
              selectedStatuses={queueStatuses}
              sortBy={queueSort.sortBy}
              sortDirection={queueSort.sortDirection}
              loading={queueLoading}
              onPageChange={setQueuePage}
              onPageSizeChange={(nextPageSize) => {
                setQueuePageSize(nextPageSize);
                setQueuePage(0);
              }}
              onStatusesChange={(nextStatuses) => {
                setQueueStatuses(nextStatuses);
                setQueuePage(0);
              }}
              onSortChange={(sortBy, sortDirection) => {
                setQueueSort({ sortBy, sortDirection });
                setQueuePage(0);
              }}
            />
          )}
        </>
      )}
    </Stack>
  );
}
