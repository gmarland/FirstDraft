import { useCallback, useState } from "react";
import { Alert, Button, Skeleton, Stack } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import { PageHeader } from "../components/PageHeader";
import { TaskQueuePanel } from "../components/workers/TaskQueuePanel";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAsyncData } from "../lib/useAsyncData";
import type {
  CommandStatus,
  TaskQueueSortBy,
  TaskQueueSortDirection,
} from "../types/api";

type TaskQueueSort = {
  sortBy?: TaskQueueSortBy;
  sortDirection?: TaskQueueSortDirection;
};

export function TaskQueuePage() {
  const { token, user } = useAuth();
  const [queuePage, setQueuePage] = useState(0);
  const [queuePageSize, setQueuePageSize] = useState(10);
  const [queueStatuses, setQueueStatuses] = useState<CommandStatus[]>([
    "queued",
    "in_progress",
  ]);
  const [queueSort, setQueueSort] = useState<TaskQueueSort>({
    sortDirection: "asc",
  });

  const loadQueue = useCallback(
    () =>
      api.listTaskQueue(token!, {
        page: queuePage,
        pageSize: queuePageSize,
        statuses: queueStatuses,
        sortBy: queueSort.sortBy,
        sortDirection: queueSort.sortDirection,
      }),
    [token, queuePage, queuePageSize, queueStatuses, queueSort],
  );

  const {
    data: taskQueue,
    error,
    loading,
    refresh,
  } = useAsyncData(loadQueue, [loadQueue]);

  return (
    <Stack spacing={2.75}>
      <PageHeader
        title="Task queue"
        actions={
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => void refresh()}
          >
            Refresh
          </Button>
        }
      />

      {error && <Alert severity="error">{error}</Alert>}
      {loading && !taskQueue && <Skeleton variant="rounded" height={260} />}
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
          loading={loading}
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
    </Stack>
  );
}
