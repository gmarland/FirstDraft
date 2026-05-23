import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import KeyIcon from "@mui/icons-material/VpnKey";
import type { CreatedApiKey } from "../../types/api";

type Props = {
  createdKey: CreatedApiKey;
  onClose(): void;
};

export function CreatedKeyModal({ createdKey, onClose }: Props) {
  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <KeyIcon />
          <span>API secret created</span>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography color="text.secondary">
            Copy this secret now. It will not be shown again after this dialog
            closes.
          </Typography>
          <Stack spacing={1.5}>
            <CopyableField label="API key" value={createdKey.apiKey} />
            <CopyableField label="API secret" value={createdKey.apiSecret} />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function CopyableField({ label, value }: { label: string; value: string }) {
  return (
    <TextField
      label={label}
      value={value}
      slotProps={{
        input: {
          readOnly: true,
          endAdornment: (
            <IconButton
              onClick={() => void navigator.clipboard.writeText(value)}
              title={`Copy ${label}`}
            >
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          ),
        },
      }}
      fullWidth
    />
  );
}
