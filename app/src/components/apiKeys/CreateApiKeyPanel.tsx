import { FormEvent, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useApiKeysStore } from "../../stores/apiKeysStore";

type Props = {
  open: boolean;
  onClose(): void;
};

export function CreateApiKeyDialog({ open, onClose }: Props) {
  const createApiKey = useApiKeysStore((state) => state.createKey);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const closeDialog = () => {
    if (submitting) return;
    onClose();
  };

  const createKey = async (event: FormEvent) => {
    event.preventDefault();

    setSubmitting(true);
    try {
      await createApiKey({
        name: name.trim() || undefined,
      });
      setName("");
      onClose();
    } catch {
      // The store owns the user-facing error message.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={closeDialog} fullWidth maxWidth="sm">
      <Stack component="form" onSubmit={createKey}>
        <DialogTitle>Add API Key</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Local client"
              disabled={submitting}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeDialog} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="contained"
            type="submit"
            startIcon={<AddIcon />}
            disabled={submitting || name.trim() === ""}
          >
            {submitting ? "Adding" : "Add API Key"}
          </Button>
        </DialogActions>
      </Stack>
    </Dialog>
  );
}
