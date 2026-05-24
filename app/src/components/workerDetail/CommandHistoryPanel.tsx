import { useEffect, useState } from "react";
import { Box, Paper, Stack, TablePagination, Typography } from "@mui/material";
import { CommandDetailPanel } from "../CommandDetailPanel";
import { CommandTimeline } from "../CommandTimeline";
import { EmptyState } from "../EmptyState";
import type { Command } from "../../types/api";

type Props = {
  workerId: string;
  commands: Command[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  onPageChange(page: number): void;
  onPageSizeChange(pageSize: number): void;
  onCommandChanged(): Promise<void>;
};

export function CommandHistoryPanel({
  workerId,
  commands,
  total,
  page,
  pageSize,
  loading,
  onPageChange,
  onPageSizeChange,
  onCommandChanged,
}: Props) {
  const [selectedCommandId, setSelectedCommandId] = useState<string | null>(null);
  const selectedCommand =
    commands.find((command) => command.transactionId === selectedCommandId) ??
    commands[0] ??
    null;

  useEffect(() => {
    if (commands.length === 0) {
      setSelectedCommandId(null);
      return;
    }

    if (!selectedCommandId || !commands.some((command) => command.transactionId === selectedCommandId)) {
      setSelectedCommandId(commands[0].transactionId);
    }
  }, [selectedCommandId, commands]);

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
          {commands.length === 0 && !loading && total === 0 && <EmptyState title="No commands yet">Queue the first command for this worker.</EmptyState>}
          {commands.length > 0 && <CommandTimeline commands={commands} selectedId={selectedCommand?.transactionId} onSelect={(command) => setSelectedCommandId(command.transactionId)} />}
          {total > 0 && (
            <TablePagination
              component="div"
              count={total}
              page={page}
              rowsPerPage={pageSize}
              rowsPerPageOptions={[5, 10, 25, 50]}
              onPageChange={(_event, nextPage) => onPageChange(nextPage)}
              onRowsPerPageChange={(event) => onPageSizeChange(Number(event.target.value))}
            />
          )}
        </Stack>
      </Paper>
      <CommandDetailPanel workerId={workerId} command={selectedCommand} onCommandChanged={onCommandChanged} />
    </Box>
  );
}
