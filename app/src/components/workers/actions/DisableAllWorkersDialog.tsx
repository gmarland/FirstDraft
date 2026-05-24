import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";

type Props = {
  open: boolean;
  disabled: boolean;
  submitting: boolean;
  onClose(): void;
  onConfirm(): void;
};

export function DisableAllWorkersDialog({
  open,
  disabled,
  submitting,
  onClose,
  onConfirm,
}: Props) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Stop all workers?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          This will disable every currently enabled worker. Queued work will not
          be dispatched until workers are enabled again.
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          startIcon={<PowerSettingsNewIcon />}
          onClick={onConfirm}
          disabled={disabled || submitting}
        >
          Stop all workers
        </Button>
      </DialogActions>
    </Dialog>
  );
}
