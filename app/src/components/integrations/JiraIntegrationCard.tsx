import type { FormEvent } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControlLabel,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Switch,
  Typography,
} from "@mui/material";
import CableIcon from "@mui/icons-material/Cable";
import { JiraConnectionSection } from "./JiraConnectionSection";
import { JiraWorkflowSection } from "./JiraWorkflowSection";
import type { JiraBoard, JiraBoardStatus } from "../../types/api";
import type { JiraFormState } from "./types";

type Props = {
  form: JiraFormState;
  boards: JiraBoard[];
  statuses: JiraBoardStatus[];
  activeStep: number;
  loading: boolean;
  loadingBoards: boolean;
  loadingStatuses: boolean;
  saving: boolean;
  testing: boolean;
  connectionSaveDisabled: boolean;
  connectionTestDisabled: boolean;
  jiraIntakeConfigured: boolean;
  workflowSelectionsComplete: boolean;
  jiraIntakeEnabled: boolean;
  onFormChange(update: Partial<JiraFormState>): void;
  onEnabledChange(enabled: boolean): void;
  onSaveConnection(event: FormEvent): void;
  onTestConnection(): void;
  onBoardChange(boardId: number): void;
  onReadyStatusChange(statusId: string): void;
  onProcessingStatusChange(statusId: string): void;
  onProcessedStatusChange(statusId: string): void;
  onRefreshBoards(): void;
  onRefreshStatuses(): void;
  onSaveWorkflow(): void;
};

export function JiraIntegrationCard({
  form,
  boards,
  statuses,
  activeStep,
  loading,
  loadingBoards,
  loadingStatuses,
  saving,
  testing,
  connectionSaveDisabled,
  connectionTestDisabled,
  jiraIntakeConfigured,
  workflowSelectionsComplete,
  jiraIntakeEnabled,
  onFormChange,
  onEnabledChange,
  onSaveConnection,
  onTestConnection,
  onBoardChange,
  onReadyStatusChange,
  onProcessingStatusChange,
  onProcessedStatusChange,
  onRefreshBoards,
  onRefreshStatuses,
  onSaveWorkflow,
}: Props) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2.5}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1.5}
            sx={{ justifyContent: "space-between" }}
          >
            <Box>
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: "center", mb: 0.75 }}
              >
                <CableIcon color="primary" />
                <Typography variant="h2">Jira</Typography>
                {jiraIntakeEnabled && (
                  <Chip size="small" color="primary" label="Enabled" />
                )}
              </Stack>
              <Typography color="text.secondary">
                Connect Jira, choose a board, and map workflow states for AI
                ticket intake.
              </Typography>
            </Box>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              sx={{ alignItems: { xs: "flex-start", sm: "center" } }}
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
            </Stack>
          </Stack>

          <Stepper activeStep={activeStep} alternativeLabel>
            {["Connection", "Workflow"].map((label, index) => (
              <Step
                key={label}
                completed={index === 0 ? form.connected : jiraIntakeConfigured}
              >
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          <Divider />

          <JiraConnectionSection
            form={form}
            loading={loading}
            saving={saving}
            testing={testing}
            connectionSaveDisabled={connectionSaveDisabled}
            connectionTestDisabled={connectionTestDisabled}
            onFormChange={onFormChange}
            onSaveConnection={onSaveConnection}
            onTestConnection={onTestConnection}
          />

          {form.connected && (
            <>
              <Divider />
              <JiraWorkflowSection
                form={form}
                boards={boards}
                statuses={statuses}
                loadingBoards={loadingBoards}
                loadingStatuses={loadingStatuses}
                saving={saving}
                jiraIntakeConfigured={jiraIntakeConfigured}
                workflowSelectionsComplete={workflowSelectionsComplete}
                onBoardChange={onBoardChange}
                onReadyStatusChange={onReadyStatusChange}
                onProcessingStatusChange={onProcessingStatusChange}
                onProcessedStatusChange={onProcessedStatusChange}
                onRefreshBoards={onRefreshBoards}
                onRefreshStatuses={onRefreshStatuses}
                onSaveWorkflow={onSaveWorkflow}
              />
            </>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
