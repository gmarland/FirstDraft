import { Box, Paper, Stack, Typography } from "@mui/material";
import { CommandComposer } from "../CommandComposer";
import type { CommandMode, GitRepositorySuggestion } from "../../types/api";

type Props = {
  disabled: boolean;
  disabledReason?: string;
  supportedSkills: string[];
  enabledTaskTypes?: CommandMode[];
  gitRepositorySuggestions?: GitRepositorySuggestion[];
  onSubmit(command: string, commandMode: CommandMode): Promise<void>;
};

export function QuickCommandPanel({ disabled, disabledReason, supportedSkills, enabledTaskTypes, gitRepositorySuggestions = [], onSubmit }: Props) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h2">Quick command</Typography>
        </Box>
        <CommandComposer
          disabled={disabled}
          supportedSkills={supportedSkills}
          enabledTaskTypes={enabledTaskTypes}
          gitRepositorySuggestions={gitRepositorySuggestions}
          onSubmit={onSubmit}
        />
        {disabled && (
          <Typography color="text.secondary">
            {disabledReason ?? "Commands are disabled."}
          </Typography>
        )}
      </Stack>
    </Paper>
  );
}
