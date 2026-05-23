import { FormEvent } from "react";
import { Box, Button, Stack, TextField } from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import SaveIcon from "@mui/icons-material/Save";
import { SectionTitle } from "./SectionTitle";
import { twoColumnGridSx } from "./layout";
import type { JiraFormState } from "./types";

type Props = {
  form: JiraFormState;
  loading: boolean;
  saving: boolean;
  testing: boolean;
  connectionSaveDisabled: boolean;
  connectionTestDisabled: boolean;
  onFormChange(update: Partial<JiraFormState>): void;
  onSaveConnection(event: FormEvent): void;
  onTestConnection(): void;
};

export function JiraConnectionSection({
  form,
  loading,
  saving,
  testing,
  connectionSaveDisabled,
  connectionTestDisabled,
  onFormChange,
  onSaveConnection,
  onTestConnection,
}: Props) {
  return (
    <Stack component="form" spacing={1.5} onSubmit={onSaveConnection}>
      <SectionTitle title="1. Connection" complete={form.connected} />
      <Box sx={twoColumnGridSx}>
        <TextField
          label="Jira site URL"
          value={form.siteUrl}
          onChange={(event) => onFormChange({ siteUrl: event.target.value })}
          placeholder="https://example.atlassian.net"
          fullWidth
          disabled={loading || saving}
        />
        <TextField
          label="Jira account email"
          value={form.email}
          onChange={(event) => onFormChange({ email: event.target.value })}
          fullWidth
          disabled={loading || saving}
        />
        <TextField
          label={
            form.connected
              ? "Personal access token replacement"
              : "Personal access token"
          }
          value={form.apiToken}
          onChange={(event) => onFormChange({ apiToken: event.target.value })}
          type="password"
          helperText={
            form.connected
              ? "Leave blank to keep the stored token."
              : "Use an Atlassian API token for Jira Cloud."
          }
          fullWidth
          disabled={loading || saving}
          sx={{ gridColumn: "1 / -1" }}
        />
      </Box>
      <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
        <Button
          variant="outlined"
          startIcon={<PlayArrowIcon />}
          onClick={onTestConnection}
          disabled={connectionTestDisabled}
        >
          {testing ? "Testing" : "Test connection"}
        </Button>
        <Button
          variant="contained"
          type="submit"
          startIcon={<SaveIcon />}
          disabled={connectionSaveDisabled}
        >
          {saving ? "Saving" : "Save connection"}
        </Button>
      </Stack>
    </Stack>
  );
}
