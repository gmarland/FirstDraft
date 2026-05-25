import {
  Box,
  Button,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import { SectionTitle } from "./SectionTitle";
import { twoColumnGridSx } from "./layout";
import type { JiraBoard, JiraBoardStatus } from "../../types/api";
import type { JiraFormState } from "./types";

type Props = {
  form: JiraFormState;
  boards: JiraBoard[];
  statuses: JiraBoardStatus[];
  loadingBoards: boolean;
  loadingStatuses: boolean;
  saving: boolean;
  jiraIntakeConfigured: boolean;
  workflowSelectionsComplete: boolean;
  jiraIntakeEnabled: boolean;
  onBoardChange(boardId: number): void;
  onReadyStatusChange(statusId: string): void;
  onProcessingStatusChange(statusId: string): void;
  onProcessedStatusChange(statusId: string): void;
  onEnabledChange(enabled: boolean): void;
  onRefreshBoards(): void;
  onRefreshStatuses(): void;
  onSaveWorkflow(): void;
};

export function JiraWorkflowSection({
  form,
  boards,
  statuses,
  loadingBoards,
  loadingStatuses,
  saving,
  jiraIntakeConfigured,
  workflowSelectionsComplete,
  jiraIntakeEnabled,
  onBoardChange,
  onReadyStatusChange,
  onProcessingStatusChange,
  onProcessedStatusChange,
  onEnabledChange,
  onRefreshBoards,
  onRefreshStatuses,
  onSaveWorkflow,
}: Props) {
  return (
    <Stack spacing={1.5}>
      <SectionTitle title="2. Workflow" complete={jiraIntakeConfigured} />
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <TextField
          select
          label="Board"
          value={form.boardId ?? ""}
          onChange={(event) => onBoardChange(Number(event.target.value))}
          helperText="Choose the Jira board that owns AI-ready tickets."
          fullWidth
          disabled={loadingBoards || saving}
        >
          {boards.map((board) => (
            <MenuItem key={board.id} value={board.id}>
              {board.name} ({board.type})
            </MenuItem>
          ))}
        </TextField>
        <Tooltip title="Refresh boards">
          <span>
            <IconButton
              aria-label="Refresh boards"
              onClick={onRefreshBoards}
              disabled={loadingBoards}
              sx={{ mt: 1, width: 40, height: 40 }}
            >
              <RefreshIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <Box
          sx={{
            ...twoColumnGridSx,
            flex: 1,
            gridTemplateColumns: { xs: "1fr", lg: "repeat(3, minmax(0, 1fr))" },
          }}
        >
          <TextField
            select
            label="Ready for AI status"
            value={form.readyStatusId}
            onChange={(event) => onReadyStatusChange(event.target.value)}
            helperText={
              form.boardId
                ? "Tickets in this status will be treated as ready for AI."
                : "Select a board first."
            }
            fullWidth
            disabled={!form.boardId || loadingStatuses || saving}
          >
            {statuses.map((status) => (
              <MenuItem key={status.id} value={status.id}>
                {status.name}
                {status.statusCategory ? ` (${status.statusCategory})` : ""}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Processing AI status"
            value={form.processingStatusId}
            onChange={(event) => onProcessingStatusChange(event.target.value)}
            helperText={
              form.boardId
                ? "FirstDraft will move tickets here while AI processing is running."
                : "Select a board first."
            }
            fullWidth
            disabled={!form.boardId || loadingStatuses || saving}
          >
            {statuses.map((status) => (
              <MenuItem key={status.id} value={status.id}>
                {status.name}
                {status.statusCategory ? ` (${status.statusCategory})` : ""}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Processed status"
            value={form.processedStatusId}
            onChange={(event) => onProcessedStatusChange(event.target.value)}
            helperText={
              form.boardId
                ? "After AI processing, FirstDraft will move the Jira ticket to this status."
                : "Select a board first."
            }
            fullWidth
            disabled={!form.boardId || loadingStatuses || saving}
          >
            {statuses.map((status) => (
              <MenuItem key={status.id} value={status.id}>
                {status.name}
                {status.statusCategory ? ` (${status.statusCategory})` : ""}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        <Tooltip title="Refresh statuses">
          <span>
            <IconButton
              aria-label="Refresh statuses"
              onClick={onRefreshStatuses}
              disabled={!form.boardId || loadingStatuses}
              sx={{ mt: 1, width: 40, height: 40 }}
            >
              <RefreshIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{
          alignItems: { xs: "flex-start", sm: "center" },
          justifyContent: "space-between",
        }}
      >
        <FormControlLabel
          control={
            <Switch
              checked={jiraIntakeEnabled}
              onChange={(event) => onEnabledChange(event.target.checked)}
              disabled={!jiraIntakeConfigured || saving}
            />
          }
          label="Enable Jira ticket intake"
        />
        <Button
          variant="contained"
          onClick={onSaveWorkflow}
          disabled={!workflowSelectionsComplete || saving}
        >
          Save workflow
        </Button>
      </Stack>
    </Stack>
  );
}
