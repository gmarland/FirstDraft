import { FormEvent, SyntheticEvent, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CableIcon from "@mui/icons-material/Cable";
import DeleteIcon from "@mui/icons-material/Delete";
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog";
import { JiraIntegrationCard } from "../components/integrations/JiraIntegrationCard";
import type { JiraFormState } from "../components/integrations/types";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../stores/authStore";
import type {
  JiraBoard,
  JiraBoardStatus,
  JiraIntegrationSettings,
} from "../types/api";
import { PageHeader } from "../components/PageHeader";

const emptyForm: JiraFormState = {
  id: "",
  connected: false,
  enabled: false,
  siteUrl: "",
  email: "",
  apiToken: "",
  boardName: "",
  boardType: "",
  readyStatusId: "",
  readyStatusName: "",
  processingStatusId: "",
  processingStatusName: "",
  processedStatusId: "",
  processedStatusName: "",
};

export function IntegrationsPage() {
  const token = useAuthStore((state) => state.token);
  const logout = useAuthStore((state) => state.logout);
  const selectedBoardIdRef = useRef<number | undefined>();
  const statusLoadBoardIdRef = useRef<number | undefined>();
  const [integrations, setIntegrations] = useState<JiraIntegrationSettings[]>(
    [],
  );
  const [form, setForm] = useState<JiraFormState>(emptyForm);
  const [boards, setBoards] = useState<JiraBoard[]>([]);
  const [statuses, setStatuses] = useState<JiraBoardStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [loadingStatuses, setLoadingStatuses] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [workflowSaved, setWorkflowSaved] = useState(false);
  const [connectionTestPassed, setConnectionTestPassed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    const authToken = token;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await api.listJiraIntegrations(authToken);
        if (cancelled) return;
        setIntegrations(result.integrations);
        selectedBoardIdRef.current = undefined;
        statusLoadBoardIdRef.current = undefined;
        setForm(emptyForm);
        setWorkflowSaved(false);
        setConnectionTestPassed(false);
      } catch (caught) {
        handleAuthError(caught, logout);
        if (!cancelled)
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load integrations",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [token, logout]);

  useEffect(() => {
    if (!dialogOpen || !token || !form.id || !form.connected) return;
    void loadBoards(token, form.id);
  }, [dialogOpen, token, form.id, form.connected]);

  useEffect(() => {
    if (!dialogOpen || !token || !form.id || !form.boardId) return;
    if (statusLoadBoardIdRef.current === form.boardId) return;
    void loadStatuses(token, form.boardId, form.id);
  }, [dialogOpen, token, form.id, form.boardId]);

  const activeStep = (() => {
    if (!form.connected) return 0;
    if (workflowSaved) return 2;
    return 1;
  })();

  const workflowSelectionsComplete = hasCompleteJiraWorkflow(form);
  const jiraIntakeConfigured = workflowSaved && workflowSelectionsComplete;
  const jiraIntakeEnabled = jiraIntakeConfigured && form.enabled;
  const newConnectionCredentialsComplete =
    hasCompleteNewConnectionCredentials(form);
  const connectionSaveDisabled =
    loading ||
    saving ||
    (!form.id && (!newConnectionCredentialsComplete || !connectionTestPassed));
  const connectionTestDisabled =
    loading ||
    testing ||
    (form.id ? !form.connected : !newConnectionCredentialsComplete);

  const closeNotice = (_event?: Event | SyntheticEvent, reason?: string) => {
    if (reason === "clickaway") return;
    setNotice(null);
  };

  const closeError = (_event?: Event | SyntheticEvent, reason?: string) => {
    if (reason === "clickaway") return;
    setError(null);
  };

  const updateForm = (update: Partial<JiraFormState>) => {
    if ("siteUrl" in update || "email" in update || "apiToken" in update) {
      setConnectionTestPassed(false);
    }
    setForm((current) => ({ ...current, ...update }));
  };

  const setIntakeEnabled = async (enabled: boolean) => {
    if (!token || !form.id) return;

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await api.setJiraIntegrationEnabled(
        token,
        form.id,
        enabled,
      );
      setIntegrations((current) => upsertIntegration(current, saved));
      setForm((current) => ({ ...current, ...saved, apiToken: "" }));
      setWorkflowSaved(hasCompleteJiraWorkflow(saved));
      setNotice(
        enabled
          ? "Jira ticket intake enabled."
          : "Jira ticket intake disabled.",
      );
    } catch (caught) {
      handleAuthError(caught, logout);
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to update Jira ticket intake",
      );
    } finally {
      setSaving(false);
    }
  };

  const openIntegrationDialog = (integration: JiraIntegrationSettings) => {
    selectedBoardIdRef.current = integration.boardId;
    statusLoadBoardIdRef.current = undefined;
    setBoards([]);
    setStatuses([]);
    setForm({ ...emptyForm, ...integration, apiToken: "" });
    setWorkflowSaved(hasCompleteJiraWorkflow(integration));
    setConnectionTestPassed(false);
    setDialogOpen(true);
  };

  const openNewIntegrationDialog = () => {
    selectedBoardIdRef.current = undefined;
    statusLoadBoardIdRef.current = undefined;
    setBoards([]);
    setStatuses([]);
    setForm(emptyForm);
    setWorkflowSaved(false);
    setConnectionTestPassed(false);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (saving || deleting) return;
    setDialogOpen(false);
  };

  const selectBoard = (boardId: number) => {
    const board = boards.find((candidate) => candidate.id === boardId);
    selectedBoardIdRef.current = boardId;
    setWorkflowSaved(false);
    setStatuses([]);
    setForm((current) => ({
      ...current,
      boardId,
      boardName: board?.name ?? "",
      boardType: board?.type ?? "",
      boardFilterId: board?.filterId,
      readyStatusId: "",
      readyStatusName: "",
      processingStatusId: "",
      processingStatusName: "",
      processedStatusId: "",
      processedStatusName: "",
      enabled: false,
    }));
    if (token) void loadStatuses(token, boardId, form.id);
  };

  const selectReadyStatus = (statusId: string) => {
    const status = statuses.find((candidate) => candidate.id === statusId);
    setWorkflowSaved(false);
    setForm((current) => ({
      ...current,
      readyStatusId: status?.id ?? "",
      readyStatusName: status?.name ?? "",
      processingStatusId: "",
      processingStatusName: "",
      processedStatusId: "",
      processedStatusName: "",
      enabled: false,
    }));
  };

  const selectProcessingStatus = (statusId: string) => {
    const status = statuses.find((candidate) => candidate.id === statusId);
    setWorkflowSaved(false);
    setForm((current) => ({
      ...current,
      processingStatusId: status?.id ?? "",
      processingStatusName: status?.name ?? "",
      enabled: false,
    }));
  };

  const selectProcessedStatus = (statusId: string) => {
    const status = statuses.find((candidate) => candidate.id === statusId);
    setWorkflowSaved(false);
    setForm((current) => ({
      ...current,
      processedStatusId: status?.id ?? "",
      processedStatusName: status?.name ?? "",
      enabled: false,
    }));
  };

  const refreshBoards = () => {
    if (token) void loadBoards(token, form.id);
  };

  const refreshStatuses = () => {
    if (token && form.boardId) void loadStatuses(token, form.boardId, form.id);
  };

  const saveConnection = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await api.saveJiraConnection(
        token,
        {
          siteUrl: form.siteUrl,
          email: form.email,
          apiToken: form.apiToken,
        },
        form.id || undefined,
      );
      setIntegrations((current) => upsertIntegration(current, saved));
      setForm({ ...emptyForm, ...saved, apiToken: "" });
      setWorkflowSaved(hasCompleteJiraWorkflow(saved));
      setConnectionTestPassed(false);
      setNotice("Jira connection saved.");
      void loadBoards(token, saved.id);
    } catch (caught) {
      handleAuthError(caught, logout);
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to save Jira connection",
      );
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!token) return;

    setTesting(true);
    setError(null);
    setNotice(null);
    try {
      if (form.id) {
        await api.testJiraConnection(token, form.id);
      } else {
        if (!newConnectionCredentialsComplete) return;
        await api.testUnsavedJiraConnection(token, {
          siteUrl: form.siteUrl.trim(),
          email: form.email.trim(),
          apiToken: form.apiToken.trim(),
        });
        setConnectionTestPassed(true);
      }
      setNotice("Jira connection test passed.");
    } catch (caught) {
      handleAuthError(caught, logout);
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to test Jira connection",
      );
    } finally {
      setTesting(false);
    }
  };

  const saveWorkflow = async () => {
    if (!token || !form.id || !form.boardId) return;

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await api.saveJiraWorkflow(token, form.id, {
        boardId: form.boardId,
        boardName: form.boardName,
        boardType: form.boardType,
        boardFilterId: form.boardFilterId,
        readyStatusId: form.readyStatusId,
        readyStatusName: form.readyStatusName,
        processingStatusId: form.processingStatusId,
        processingStatusName: form.processingStatusName,
        processedStatusId: form.processedStatusId,
        processedStatusName: form.processedStatusName,
        enabled: form.enabled,
      });
      setIntegrations((current) => upsertIntegration(current, saved));
      setForm({ ...emptyForm, ...saved, apiToken: "" });
      setWorkflowSaved(true);
      setNotice("Jira workflow saved.");
    } catch (caught) {
      handleAuthError(caught, logout);
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to save Jira workflow",
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteIntegration = async () => {
    if (!token || !form.id) return;

    setDeleting(true);
    setError(null);
    setNotice(null);
    try {
      const deleted = await api.deleteJiraIntegration(token, form.id);
      setIntegrations((current) =>
        current.filter((integration) => integration.id !== deleted.id),
      );
      selectedBoardIdRef.current = undefined;
      statusLoadBoardIdRef.current = undefined;
      setForm(emptyForm);
      setWorkflowSaved(false);
      setConnectionTestPassed(false);
      setBoards([]);
      setStatuses([]);
      setDeleteDialogOpen(false);
      setDialogOpen(false);
      setNotice("Jira integration deleted.");
    } catch (caught) {
      handleAuthError(caught, logout);
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to delete Jira integration",
      );
    } finally {
      setDeleting(false);
    }
  };

  async function loadBoards(authToken: string, integrationId: string) {
    if (!integrationId) return;
    setLoadingBoards(true);
    try {
      const result = await api.listJiraBoards(authToken, integrationId);
      setBoards(result.boards);
      const configuredBoardId = selectedBoardIdRef.current ?? form.boardId;
      const board = configuredBoardId
        ? result.boards.find((candidate) => candidate.id === configuredBoardId)
        : result.boards[0];

      if (!board) return;

      selectedBoardIdRef.current = board.id;
      if (!configuredBoardId) {
        setWorkflowSaved(false);
        setForm((current) => ({
          ...current,
          boardId: board.id,
          boardName: board.name,
          boardType: board.type,
          boardFilterId: board.filterId,
          readyStatusId: "",
          readyStatusName: "",
          processingStatusId: "",
          processingStatusName: "",
          processedStatusId: "",
          processedStatusName: "",
          enabled: false,
        }));
      }
      void loadStatuses(authToken, board.id, integrationId);
    } catch (caught) {
      handleAuthError(caught, logout);
      setError(
        caught instanceof Error ? caught.message : "Unable to load Jira boards",
      );
    } finally {
      setLoadingBoards(false);
    }
  }

  async function loadStatuses(
    authToken: string,
    boardId: number,
    integrationId: string,
  ) {
    if (!integrationId) return;
    selectedBoardIdRef.current = boardId;
    statusLoadBoardIdRef.current = boardId;
    setStatuses([]);
    setLoadingStatuses(true);
    try {
      const result = await api.listJiraBoardStatuses(
        authToken,
        integrationId,
        boardId,
      );
      if (selectedBoardIdRef.current !== boardId) return;
      setStatuses(result.statuses);
    } catch (caught) {
      if (selectedBoardIdRef.current !== boardId) return;
      handleAuthError(caught, logout);
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load Jira board statuses",
      );
    } finally {
      if (selectedBoardIdRef.current === boardId) setLoadingStatuses(false);
    }
  }

  return (
    <>
      <Stack spacing={2.75}>
        <PageHeader title="Integrations" />
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, minmax(0, 1fr))",
              lg: "repeat(3, minmax(0, 1fr))",
            },
            gap: 1.5,
          }}
        >
          <Card variant="outlined">
            <CardActionArea
              onClick={openNewIntegrationDialog}
              disabled={loading || saving}
              sx={{ height: "100%" }}
            >
              <CardContent
                sx={{
                  minHeight: 168,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                <Stack spacing={1} sx={{ alignItems: "center" }}>
                  <AddIcon color="primary" />
                  <Typography variant="h2">Add Jira</Typography>
                  <Typography color="text.secondary">
                    Connect another Jira account or workspace.
                  </Typography>
                </Stack>
              </CardContent>
            </CardActionArea>
          </Card>
          {integrations.map((integration) => (
            <JiraIntegrationSummaryCard
              key={integration.id}
              integration={integration}
              onClick={() => openIntegrationDialog(integration)}
            />
          ))}
        </Box>
      </Stack>
      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="lg" fullWidth>
        <DialogTitle>
          {form.id ? "Edit Jira Integration" : "Add Jira Integration"}
        </DialogTitle>
        <DialogContent>
          <JiraIntegrationCard
            form={form}
            boards={boards}
            statuses={statuses}
            activeStep={activeStep}
            loading={loading}
            loadingBoards={loadingBoards}
            loadingStatuses={loadingStatuses}
            saving={saving}
            testing={testing}
            connectionSaveDisabled={connectionSaveDisabled}
            connectionTestDisabled={connectionTestDisabled}
            jiraIntakeConfigured={jiraIntakeConfigured}
            workflowSelectionsComplete={workflowSelectionsComplete}
            jiraIntakeEnabled={jiraIntakeEnabled}
            onFormChange={updateForm}
            onEnabledChange={setIntakeEnabled}
            onSaveConnection={saveConnection}
            onTestConnection={testConnection}
            onBoardChange={selectBoard}
            onReadyStatusChange={selectReadyStatus}
            onProcessingStatusChange={selectProcessingStatus}
            onProcessedStatusChange={selectProcessedStatus}
            onRefreshBoards={refreshBoards}
            onRefreshStatuses={refreshStatuses}
            onSaveWorkflow={saveWorkflow}
          />
        </DialogContent>
        <DialogActions sx={{ justifyContent: "space-between", px: 3, pb: 2 }}>
          <Box>
            {form.id && (
              <Tooltip title="Delete Jira integration">
                <span>
                  <IconButton
                    aria-label="Delete Jira integration"
                    color="error"
                    onClick={() => setDeleteDialogOpen(true)}
                    disabled={loading || deleting}
                    size="small"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            )}
          </Box>
          <Button onClick={closeDialog} disabled={saving || deleting}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        title="Delete Jira integration?"
        description="This Jira integration and its workflow settings will be deleted. This cannot be undone."
        confirmLabel="Delete integration"
        submitting={deleting}
        onClose={() => {
          if (!deleting) setDeleteDialogOpen(false);
        }}
        onConfirm={() => void deleteIntegration()}
      />
      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={4000}
        onClose={closeNotice}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={closeNotice}
          severity="success"
          variant="filled"
          sx={{ width: "100%" }}
        >
          {notice}
        </Alert>
      </Snackbar>
      <Snackbar
        open={Boolean(error)}
        autoHideDuration={6000}
        onClose={closeError}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={closeError}
          severity="error"
          variant="filled"
          sx={{ width: "100%" }}
        >
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}

function handleAuthError(caught: unknown, logout: () => void): void {
  if (caught instanceof ApiError && caught.status === 401) {
    logout();
  }
}

function upsertIntegration(
  integrations: JiraIntegrationSettings[],
  saved: JiraIntegrationSettings,
): JiraIntegrationSettings[] {
  const index = integrations.findIndex(
    (integration) => integration.id === saved.id,
  );
  if (index === -1) return [...integrations, saved];
  return integrations.map((integration) =>
    integration.id === saved.id ? saved : integration,
  );
}

function formatIntegrationLabel(integration: JiraIntegrationSettings): string {
  const account = [integration.siteUrl, integration.email]
    .filter(Boolean)
    .join(" - ");
  return account || "Unsaved Jira integration";
}

function hasCompleteNewConnectionCredentials(
  form: Pick<JiraFormState, "siteUrl" | "email" | "apiToken">,
): boolean {
  return Boolean(
    form.siteUrl.trim() && form.email.trim() && form.apiToken.trim(),
  );
}

function JiraIntegrationSummaryCard({
  integration,
  onClick,
}: {
  integration: JiraIntegrationSettings;
  onClick(): void;
}) {
  return (
    <Card variant="outlined">
      <CardActionArea onClick={onClick} sx={{ height: "100%" }}>
        <CardContent sx={{ minHeight: 168 }}>
          <Stack spacing={1.25} sx={{ height: "100%" }}>
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "center", justifyContent: "space-between" }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <CableIcon color="primary" />
                <Typography variant="h2">Jira</Typography>
              </Stack>
              <Stack direction="row" spacing={0.75}>
                <Chip
                  size="small"
                  color={integration.enabled ? "primary" : "default"}
                  label={integration.enabled ? "Enabled" : "Disabled"}
                />
              </Stack>
            </Stack>
            <Box>
              <Typography sx={{ fontWeight: 700 }}>
                {integration.siteUrl || "New Jira integration"}
              </Typography>
              <Typography color="text.secondary">
                {integration.email || "Connection details not saved"}
              </Typography>
            </Box>
            <Stack
              direction="row"
              spacing={0.75}
              sx={{ flexWrap: "wrap", mt: "auto" }}
            >
              {integration.boardName && (
                <Chip
                  size="small"
                  variant="outlined"
                  label={integration.boardName}
                />
              )}
            </Stack>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

function hasCompleteJiraWorkflow(
  settings: Pick<
    JiraIntegrationSettings,
    | "connected"
    | "boardId"
    | "boardName"
    | "boardType"
    | "readyStatusId"
    | "readyStatusName"
    | "processingStatusId"
    | "processingStatusName"
    | "processedStatusId"
    | "processedStatusName"
  >,
): boolean {
  return Boolean(
    settings.connected &&
    settings.boardId &&
    settings.boardName &&
    settings.boardType &&
    settings.readyStatusId &&
    settings.readyStatusName &&
    settings.processingStatusId &&
    settings.processingStatusName &&
    settings.processedStatusId &&
    settings.processedStatusName,
  );
}
