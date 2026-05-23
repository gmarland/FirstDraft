import { useEffect, useMemo, useState } from "react";
import { Box, Paper, Stack, Typography } from "@mui/material";
import { CommandDetailPanel } from "../CommandDetailPanel";
import { CommandTimeline } from "../CommandTimeline";
import { EmptyState } from "../EmptyState";
import type { Command } from "../../types/api";

type Props = {
  workerId: string;
  commands: Command[];
  loading: boolean;
  onCommandChanged(): Promise<void>;
};

export function CommandHistoryPanel({ workerId, commands, loading, onCommandChanged }: Props) {
  const [selectedCommandId, setSelectedCommandId] = useState<string | null>(null);
  const sortedCommands = useMemo(
    () =>
      [...commands].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [commands],
  );
  const selectedCommand =
    sortedCommands.find((command) => command.transactionId === selectedCommandId) ??
    sortedCommands[0] ??
    null;

  useEffect(() => {
    if (!selectedCommandId && sortedCommands.length > 0) {
      setSelectedCommandId(sortedCommands[0].transactionId);
    }
  }, [selectedCommandId, sortedCommands]);

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0, 7fr) minmax(0, 5fr)" }, gap: 2, alignItems: "flex-start" }}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
              History
            </Typography>
            <Typography variant="h2">Commands</Typography>
          </Box>
          {commands.length === 0 && !loading && <EmptyState title="No commands yet">Queue the first command for this worker.</EmptyState>}
          {sortedCommands.length > 0 && <CommandTimeline commands={sortedCommands} selectedId={selectedCommand?.transactionId} onSelect={(command) => setSelectedCommandId(command.transactionId)} />}
        </Stack>
      </Paper>
      <CommandDetailPanel workerId={workerId} command={selectedCommand} onCommandChanged={onCommandChanged} />
    </Box>
  );
}
