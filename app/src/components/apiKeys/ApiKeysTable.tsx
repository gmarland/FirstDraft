import { useState } from "react";
import {
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import { DeleteConfirmationDialog } from "../DeleteConfirmationDialog";
import { EmptyState } from "../EmptyState";
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
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h2">Active keys</Typography>
        {activeKeys.length === 0 && !loading && (
          <EmptyState title="No active API keys">
            Create a key to configure and register a client worker.
          </EmptyState>
        )}
        {activeKeys.length > 0 && (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>API Key</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {activeKeys.map((key) => (
                  <TableRow key={key.keyId}>
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
                      <IconButton
                        title="Copy API key"
                        onClick={() =>
                          void navigator.clipboard.writeText(key.apiKey)
                        }
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        color="error"
                        title="Revoke key"
                        onClick={() => setKeyToRevoke(key)}
                        disabled={revoking}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Stack>
      <DeleteConfirmationDialog
        open={Boolean(keyToRevoke)}
        title="Revoke API key?"
        description="Connected clients using this key will no longer authenticate."
        confirmLabel="Revoke key"
        submitting={revoking}
        onClose={closeRevokeDialog}
        onConfirm={() => void revoke()}
      />
    </Paper>
  );
}
