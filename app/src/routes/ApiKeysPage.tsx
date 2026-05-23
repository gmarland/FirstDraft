import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Stack } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { ApiKeysTable } from "../components/apiKeys/ApiKeysTable";
import { CreateApiKeyDialog } from "../components/apiKeys/CreateApiKeyPanel";
import { CreatedKeyModal } from "../components/apiKeys/CreatedKeyModal";
import { PageHeader } from "../components/PageHeader";
import { useApiKeysStore } from "../stores/apiKeysStore";

export function ApiKeysPage() {
  const keys = useApiKeysStore((state) => state.keys);
  const loading = useApiKeysStore((state) => state.loading);
  const error = useApiKeysStore((state) => state.error);
  const actionError = useApiKeysStore((state) => state.actionError);
  const createdKey = useApiKeysStore((state) => state.createdKey);
  const loadKeys = useApiKeysStore((state) => state.loadKeys);
  const clearCreatedKey = useApiKeysStore((state) => state.clearCreatedKey);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  useEffect(() => {
    void loadKeys();
    const id = window.setInterval(() => void loadKeys(), 10000);
    return () => window.clearInterval(id);
  }, [loadKeys]);

  const activeKeys = useMemo(
    () => (keys ?? []).filter((key) => !key.revokedAt),
    [keys],
  );

  return (
    <Stack spacing={2.75}>
      <PageHeader
        title="API Keys"
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
          >
            Add API Key
          </Button>
        }
      />

      {(error || actionError) && (
        <Alert severity="error">{error || actionError}</Alert>
      )}

      <ApiKeysTable activeKeys={activeKeys} loading={loading} />

      <CreateApiKeyDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
      />

      {createdKey && (
        <CreatedKeyModal createdKey={createdKey} onClose={clearCreatedKey} />
      )}
    </Stack>
  );
}
