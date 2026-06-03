import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  submittingLabel?: string;
  confirmIcon?: ReactNode;
  submitting?: boolean;
  onClose(): void;
  onConfirm(): void;
};

export function DeleteConfirmationDialog({
  open,
  title,
  description,
  confirmLabel = "Delete",
  submittingLabel = "Deleting",
  confirmIcon = <DeleteIcon />,
  submitting = false,
  onClose,
  onConfirm,
}: Props) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{description}</DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          startIcon={confirmIcon}
          onClick={onConfirm}
          disabled={submitting}
        >
          {submitting ? submittingLabel : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
