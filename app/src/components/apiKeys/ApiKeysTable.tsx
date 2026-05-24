import { useState } from "react";
import {
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import { DeleteConfirmationDialog } from "../DeleteConfirmationDialog";
import { formatDate, relativeTime } from "../../lib/dates";
import { useApiKeysStore } from "../../stores/apiKeysStore";
import type { ApiKey } from "../../types/api";

type Props = {
  activeKeys: ApiKey[];
  loading: boolean;
};

export function ApiKeysTable({ activeKeys, loading }: Props) {
  const revokeKey = useApiKeysStore((state) => state.revokeKey);
  const [keyToRevoke, setKeyToRevoke] = useState<ApiKey | null>(null);
  const [revoking, setRevoking] = useState(false);

  const closeRevokeDialog = () => {
    if (revoking) return;
    setKeyToRevoke(null);
  };

  const revoke = async () => {
    if (!keyToRevoke) return;

    setRevoking(true);
    try {
      await revokeKey(keyToRevoke.keyId);
      setKeyToRevoke(null);
    } finally {
      setRevoking(false);
    }
  };

  return (
    <>
      <TableContainer component={Paper} variant="outlined">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>API Key</TableCell>
              <TableCell>Created</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {activeKeys.map((key) => (
              <TableRow key={key.keyId} hover>
                <TableCell>
                  <Typography sx={{ fontWeight: 800 }}>
                    {key.name || "Unnamed key"}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {key.keyId}
                  </Typography>
                </TableCell>
                <TableCell>{key.apiKey}</TableCell>
                <TableCell title={formatDate(key.createdAt)}>
                  {relativeTime(key.createdAt)}
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Copy API key">
                    <IconButton
                      aria-label="Copy API key"
                      onClick={() =>
                        void navigator.clipboard.writeText(key.apiKey)
                      }
                    >
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Revoke key">
                    <span>
                      <IconButton
                        aria-label="Revoke key"
                        color="error"
                        onClick={() => setKeyToRevoke(key)}
                        disabled={revoking}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {activeKeys.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography color="text.secondary">
                    {loading
                      ? "Loading API keys..."
                      : "No active API keys configured."}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <DeleteConfirmationDialog
        open={Boolean(keyToRevoke)}
        title="Revoke API key?"
        description="Connected clients using this key will no longer authenticate."
        confirmLabel="Revoke key"
        submitting={revoking}
        onClose={closeRevokeDialog}
        onConfirm={() => void revoke()}
      />
    </>
  );
}
