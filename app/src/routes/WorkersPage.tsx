import { useCallback } from "react";
import { Alert, Button, Skeleton, Stack } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import { WorkersTable } from "../components/workers/table/WorkersTable";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAsyncData } from "../lib/useAsyncData";

type Props = {
  navigate(to: string): void;
};

export function WorkersPage({ navigate }: Props) {
  const { token } = useAuth();
  const load = useCallback(() => api.listWorkers(token!), [token]);
  const {
    data: workers,
    error,
    loading,
    refresh,
  } = useAsyncData(load, [load]);

  return (
    <Stack spacing={2.75}>
      <PageHeader
        title="Workers"
        actions={
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={() => void refresh()}
            >
              Refresh
            </Button>
          </Stack>
        }
      />

      {error && <Alert severity="error">{error}</Alert>}
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
    </Stack>
  );
}
