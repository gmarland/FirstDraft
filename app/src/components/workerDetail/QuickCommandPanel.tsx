import { Box, Paper, Stack, Typography } from "@mui/material";
import { CommandComposer } from "../CommandComposer";
import type { CommandMode, GitRepositorySuggestion } from "../../types/api";

type Props = {
  disabled: boolean;
  supportedSkills: string[];
  gitRepositorySuggestions?: GitRepositorySuggestion[];
  onSubmit(command: string, commandMode: CommandMode): Promise<void>;
};

export function QuickCommandPanel({ disabled, supportedSkills, gitRepositorySuggestions = [], onSubmit }: Props) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h2">Quick command</Typography>
        </Box>
        <CommandComposer
          disabled={disabled}
          supportedSkills={supportedSkills}
          gitRepositorySuggestions={gitRepositorySuggestions}
          onSubmit={onSubmit}
        />
        {disabled && (
          <Typography color="text.secondary">
            Commands are disabled while the client is offline.
          </Typography>
        )}
      </Stack>
    </Paper>
  );
}
