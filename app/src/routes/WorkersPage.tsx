import { useCallback, useState } from "react";
import { Alert, Button, Skeleton, Stack } from "@mui/material";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import KeyIcon from "@mui/icons-material/VpnKey";
import RefreshIcon from "@mui/icons-material/Refresh";
import { WorkersTable } from "../components/workers/WorkersTable";
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
  const [disableAllError, setDisableAllError] = useState<string | null>(null);
  const [disablingAll, setDisablingAll] = useState(false);
  const load = useCallback(() => api.listWorkers(token!), [token]);
  const {
    data: workers,
    error,
    loading,
    refresh,
  } = useAsyncData(load, [load], 4000);
  const hasEnabledWorkers = workers?.some((worker) => worker.enabled) ?? false;

  const disableAllWorkers = async () => {
    if (!token || disablingAll) return;

    setDisablingAll(true);
    setDisableAllError(null);
    try {
      await api.disableAllWorkers(token);
      await refresh();
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

  return (
    <Stack spacing={2.75}>
      <PageHeader
        title="Workers"
        actions={
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button
              variant="contained"
              color="error"
              startIcon={<PowerSettingsNewIcon />}
              onClick={() => void disableAllWorkers()}
              disabled={!workers || !hasEnabledWorkers || disablingAll}
            >
              Disable all workers
            </Button>
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

      {(error || disableAllError) && (
        <Alert severity="error">{error || disableAllError}</Alert>
      )}
      {loading && !workers && <Skeleton variant="rounded" height={220} />}

      {workers && workers.length === 0 && (
        <EmptyState
          title="No client workers are registered"
          action={
            <Button
              variant="contained"
              startIcon={<KeyIcon />}
              onClick={() => navigate("/settings/api-keys")}
            >
              Create API key
            </Button>
          }
        >
          Create an API key, configure the client worker, and start it.
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
