import { FormEvent } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import type { GitRepository } from "../../types/api";

export type RepositoryForm = {
  repositoryUrl: string;
  defaultSourceBranch: string;
  defaultTargetBranch: string;
  enabled: boolean;
};

type Props = {
  open: boolean;
  form: RepositoryForm;
  editingRepository: GitRepository | null;
  saving: boolean;
  deleting: boolean;
  onClose(): void;
  onSubmit(event: FormEvent): void;
  onFormChange(form: RepositoryForm): void;
};

export function RepositoryDialog({
  open,
  form,
  editingRepository,
  saving,
  deleting,
  onClose,
  onSubmit,
  onFormChange,
}: Props) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <Box component="form" onSubmit={onSubmit}>
        <DialogTitle>
          {editingRepository ? "Edit repository" : "Add repository"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Repository URL"
              value={form.repositoryUrl}
              onChange={(event) =>
                onFormChange({
                  ...form,
                  repositoryUrl: event.target.value,
                })
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
                  onFormChange({
                    ...form,
                    defaultSourceBranch: event.target.value,
                  })
                }
                disabled={saving}
                required
                fullWidth
              />
              <TextField
                label="Default target branch for PRs"
                value={form.defaultTargetBranch}
                onChange={(event) =>
                  onFormChange({
                    ...form,
                    defaultTargetBranch: event.target.value,
                  })
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
                  onFormChange({
                    ...form,
                    enabled: event.target.checked,
                  })
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
            <Button onClick={onClose} disabled={saving || deleting}>
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
  );
}
