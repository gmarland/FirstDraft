import { FormEvent, SyntheticEvent, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog";
import { PageHeader } from "../components/PageHeader";
import { api, ApiError } from "../lib/api";
import { relativeTime } from "../lib/dates";
import { useAuthStore } from "../stores/authStore";
import type { GitRepository, SaveGitRepositoryInput } from "../types/api";

type RepositoryForm = {
  repositoryUrl: string;
  defaultSourceBranch: string;
  defaultTargetBranch: string;
  enabled: boolean;
};

const emptyForm: RepositoryForm = {
  repositoryUrl: "",
  defaultSourceBranch: "main",
  defaultTargetBranch: "main",
  enabled: true,
};

export function RepositoriesPage() {
  const token = useAuthStore((state) => state.token);
  const logout = useAuthStore((state) => state.logout);
  const [repositories, setRepositories] = useState<GitRepository[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [repositoryToDelete, setRepositoryToDelete] =
    useState<GitRepository | null>(null);
  const [editingRepository, setEditingRepository] =
    useState<GitRepository | null>(null);
  const [form, setForm] = useState<RepositoryForm>(emptyForm);
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
        const result = await api.listRepositories(authToken);
        if (!cancelled) setRepositories(result.repositories);
      } catch (caught) {
        handleAuthError(caught, logout);
        if (!cancelled)
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load repositories",
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

  const closeNotice = (_event?: Event | SyntheticEvent, reason?: string) => {
    if (reason === "clickaway") return;
    setNotice(null);
  };

  const closeError = (_event?: Event | SyntheticEvent, reason?: string) => {
    if (reason === "clickaway") return;
    setError(null);
  };

  const openCreateDialog = () => {
    setEditingRepository(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEditDialog = (repository: GitRepository) => {
    setEditingRepository(repository);
    setForm({
      repositoryUrl: repository.repositoryUrl,
      defaultSourceBranch: repository.defaultSourceBranch,
      defaultTargetBranch: repository.defaultTargetBranch,
      enabled: repository.enabled,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (saving || deleting) return;
    setDialogOpen(false);
  };

  const closeDeleteDialog = () => {
    if (deleting) return;
    setRepositoryToDelete(null);
  };

  const saveRepository = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;

    const input = buildRepositoryInput(form, editingRepository);
    if (!input.repositoryUrl && !editingRepository) return;

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = editingRepository
        ? await api.updateRepository(
            token,
            editingRepository.normalizedRepositoryUrl,
            input,
          )
        : await api.createRepository(token, input);
      setRepositories((current) => upsertRepository(current, saved));
      setDialogOpen(false);
      setNotice(
        editingRepository ? "Repository updated." : "Repository added.",
      );
    } catch (caught) {
      handleAuthError(caught, logout);
      setError(
        caught instanceof Error ? caught.message : "Unable to save repository",
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteRepository = async (repository: GitRepository) => {
    if (!token) return;

    setDeleting(true);
    setError(null);
    setNotice(null);
    try {
      await api.deleteRepository(token, repository.normalizedRepositoryUrl);
      setRepositories((current) =>
        current.filter(
          (currentRepository) =>
            currentRepository.normalizedRepositoryUrl !==
            repository.normalizedRepositoryUrl,
        ),
      );
      setNotice("Repository deleted.");
      setRepositoryToDelete(null);
    } catch (caught) {
      handleAuthError(caught, logout);
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to delete repository",
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Stack spacing={2.75}>
      <PageHeader
        title="Repositories"
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={openCreateDialog}
          >
            Add repository
          </Button>
        }
      />

      {(error || loading) && (
        <Alert severity={error ? "error" : "info"}>
          {error || "Loading repositories..."}
        </Alert>
      )}

      <TableContainer component={Card} sx={{ borderRadius: 1 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Repository</TableCell>
              <TableCell>Defaults</TableCell>
              <TableCell>Last used</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {repositories.map((repository) => (
              <TableRow key={repository.normalizedRepositoryUrl} hover>
                <TableCell sx={{ maxWidth: 360 }}>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center", minWidth: 0 }}
                  >
                    <AccountTreeIcon color="action" fontSize="small" />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        className="wrap-code"
                        sx={{ fontWeight: 800 }}
                      >
                        {repository.repositoryUrl}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        className="wrap-code"
                      >
                        {repository.normalizedRepositoryUrl}
                      </Typography>
                    </Box>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack spacing={0.5}>
                    <Typography variant="body2">
                      Source: {repository.defaultSourceBranch}
                    </Typography>
                    <Typography variant="body2">
                      PR target: {repository.defaultTargetBranch}
                    </Typography>
                  </Stack>
                </TableCell>
                <TableCell>{relativeTime(repository.lastUsedAt)}</TableCell>
                <TableCell align="right">
                  <Tooltip title="Delete repository">
                    <span>
                      <IconButton
                        aria-label="Delete repository"
                        color="error"
                        onClick={() => setRepositoryToDelete(repository)}
                        disabled={deleting}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Edit repository">
                    <IconButton
                      aria-label="Edit repository"
                      onClick={() => openEditDialog(repository)}
                    >
                      <EditIcon />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {!loading && repositories.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography color="text.secondary">
                    No repositories configured.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="md">
        <Box component="form" onSubmit={saveRepository}>
          <DialogTitle>
            {editingRepository ? "Edit repository" : "Add repository"}
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <TextField
                label="Repository URL"
                value={form.repositoryUrl}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    repositoryUrl: event.target.value,
                  }))
                }
                disabled={saving || Boolean(editingRepository)}
                required
                fullWidth
              />
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <TextField
                  label="Default source branch"
                  value={form.defaultSourceBranch}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      defaultSourceBranch: event.target.value,
                    }))
                  }
                  disabled={saving}
                  required
                  fullWidth
                />
                <TextField
                  label="Default target branch for PRs"
                  value={form.defaultTargetBranch}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      defaultTargetBranch: event.target.value,
                    }))
                  }
                  disabled={saving}
                  required
                  fullWidth
                />
              </Stack>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Switch
                  checked={form.enabled}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      enabled: event.target.checked,
                    }))
                  }
                  disabled={saving}
                />
                <Typography>
                  {form.enabled
                    ? "Enabled for gitflow suggestions"
                    : "Hidden from gitflow suggestions"}
                </Typography>
              </Stack>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Stack direction="row" spacing={1}>
              <Button onClick={closeDialog} disabled={saving || deleting}>
                Cancel
              </Button>
              <Button
                variant="contained"
                type="submit"
                disabled={saving || deleting || !form.repositoryUrl.trim()}
              >
                {saving ? "Saving" : "Save"}
              </Button>
            </Stack>
          </DialogActions>
        </Box>
      </Dialog>

      <DeleteConfirmationDialog
        open={Boolean(repositoryToDelete)}
        title="Delete repository?"
        description="This repository will be removed. This cannot be undone."
        confirmLabel="Delete repository"
        submitting={deleting}
        onClose={closeDeleteDialog}
        onConfirm={() => {
          if (repositoryToDelete) void deleteRepository(repositoryToDelete);
        }}
      />

      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={3000}
        onClose={closeNotice}
        message={notice}
      />
      <Snackbar
        open={Boolean(error)}
        autoHideDuration={6000}
        onClose={closeError}
        message={error}
      />
    </Stack>
  );
}

function buildRepositoryInput(
  form: RepositoryForm,
  editingRepository: GitRepository | null,
): SaveGitRepositoryInput {
  return {
    repositoryUrl: editingRepository ? undefined : form.repositoryUrl.trim(),
    defaultSourceBranch: form.defaultSourceBranch.trim(),
    defaultTargetBranch: form.defaultTargetBranch.trim(),
    enabled: form.enabled,
  };
}

function upsertRepository(
  repositories: GitRepository[],
  saved: GitRepository,
): GitRepository[] {
  const next = repositories.filter(
    (repository) =>
      repository.normalizedRepositoryUrl !== saved.normalizedRepositoryUrl,
  );
  return [saved, ...next].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

function handleAuthError(error: unknown, logout: () => void): void {
  if (error instanceof ApiError && error.status === 401) logout();
}
