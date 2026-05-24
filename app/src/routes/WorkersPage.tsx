import { MouseEvent, useCallback, useState } from "react";
import {
  Alert,
  Button,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Skeleton,
  Stack,
  Tooltip,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import KeyIcon from "@mui/icons-material/VpnKey";
import RefreshIcon from "@mui/icons-material/Refresh";
import { DisableAllWorkersDialog } from "../components/workers/DisableAllWorkersDialog";
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
  const [actionsMenuAnchor, setActionsMenuAnchor] =
    useState<HTMLElement | null>(null);
  const [disableAllDialogOpen, setDisableAllDialogOpen] = useState(false);
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
      await refresh();
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
          </Stack>
        }
      />

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
