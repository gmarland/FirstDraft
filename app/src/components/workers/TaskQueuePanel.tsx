import { useEffect, useState } from "react";
import {
  Box,
  Chip,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from "@mui/material";
import { EmptyState } from "../EmptyState";
import { StatusBadge } from "../StatusBadge";
import { formatDate, relativeTime } from "../../lib/dates";
import type { Command } from "../../types/api";

type Props = {
  commands: Command[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  onPageChange(page: number): void;
  onPageSizeChange(pageSize: number): void;
};

export function TaskQueuePanel({
  commands,
  total,
  page,
  pageSize,
  loading,
  onPageChange,
  onPageSizeChange,
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

  if (commands.length === 0 && !loading && total === 0) {
    return (
      <EmptyState title="No active tasks">
        Jira and future integration tasks will appear here after intake.
      </EmptyState>
    );
  }

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 8fr) minmax(320px, 4fr)" }, gap: 2, alignItems: "flex-start" }}>
      <Paper variant="outlined">
        <TableContainer>
          <Table size="small" aria-label="Task queue">
            <TableHead>
              <TableRow>
                <TableCell>Status</TableCell>
                <TableCell>Task</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Worker</TableCell>
                <TableCell>Repository</TableCell>
                <TableCell>Transaction</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {commands.map((command) => (
                <TableRow
                  hover
                  selected={selectedCommand?.transactionId === command.transactionId}
                  key={command.transactionId}
                  onClick={() => setSelectedCommandId(command.transactionId)}
                  sx={{ cursor: "pointer" }}
                >
                  <TableCell>
                    <Stack spacing={0.75} sx={{ alignItems: "flex-start" }}>
                      <StatusBadge value={command.status} />
                      <Chip size="small" label={formatCommandMode(command.commandMode)} />
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ minWidth: 240, maxWidth: 420 }}>
                    <Typography component="code" className="wrap-code" sx={{ display: "block" }}>
                      {formatCommandSummary(command)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" title={formatDate(command.createdAt)}>
                      {relativeTime(command.createdAt)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography component="code" className="wrap-code">
                      {command.workerId ?? "Unassigned"}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ maxWidth: 260 }}>
                    <Typography component="code" className="wrap-code">
                      {command.repositoryUrl ?? "-"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography component="code">
                      {shortId(command.transactionId)}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
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
      </Paper>

      <TaskQueueDetail command={selectedCommand} />
    </Box>
  );
}

function TaskQueueDetail({ command }: { command: Command | null }) {
  if (!command) {
    return (
      <Paper variant="outlined" sx={detailPanelSx}>
        <Typography color="text.secondary">Select a task to inspect queue metadata.</Typography>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={detailPanelSx}>
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
              Task
            </Typography>
            <Typography sx={{ fontWeight: 800 }}>{shortId(command.transactionId)}</Typography>
          </Box>
          <StatusBadge value={command.status} />
        </Stack>
        <Divider />
        <Field label="Command" value={formatCommandDetail(command)} code />
        <Field label="Mode" value={formatCommandMode(command.commandMode)} />
        <Field label="Created" value={formatDate(command.createdAt)} />
        <Field label="Claimed" value={formatDate(command.claimedAt)} />
        <Field label="Assigned worker" value={command.workerId ?? "Unassigned"} code />
        <Field label="Repository" value={command.repositoryUrl ?? "-"} code />
        <Field label="Transaction ID" value={command.transactionId} code />
      </Stack>
    </Paper>
  );
}

function Field({
  label,
  value,
  code,
}: {
  label: string;
  value: string;
  code?: boolean;
}) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        component={code ? "code" : "p"}
        className={code ? "wrap-code" : undefined}
        sx={{ display: "block", fontWeight: code ? undefined : 800, m: 0 }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function formatCommandMode(mode: Command["commandMode"]): string {
  if (mode === "shell") return "Shell";
  if (mode === "gitflow") return "Gitflow";
  return "AI";
}

function formatCommandSummary(command: Command): string {
  if (command.commandMode !== "gitflow") return command.command;

  try {
    const payload = JSON.parse(command.command) as Partial<{
      repositoryUrl: string;
      ticketNumber: string;
      description: string;
    }>;
    return `${payload.ticketNumber ?? "Gitflow"}: ${payload.description ?? payload.repositoryUrl ?? command.command}`;
  } catch {
    return command.command;
  }
}

function formatCommandDetail(command: Command): string {
  if (command.commandMode !== "gitflow") return command.command;

  try {
    const payload = JSON.parse(command.command) as Partial<{
      repositoryUrl: string;
      sourceBranch: string;
      targetBranch: string;
      ticketNumber: string;
      description: string;
    }>;

    return [
      `Repository: ${payload.repositoryUrl ?? ""}`,
      `Source branch: ${payload.sourceBranch ?? ""}`,
      `Target branch for PRs: ${payload.targetBranch ?? payload.sourceBranch ?? ""}`,
      `Ticket: ${payload.ticketNumber ?? ""}`,
      "",
      payload.description ?? ""
    ].join("\n").trim();
  } catch {
    return command.command;
  }
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 12)}...` : value;
}

const detailPanelSx = {
  position: { lg: "sticky" },
  top: { lg: 84 },
  maxHeight: { lg: "calc(100vh - 112px)" },
  overflow: "auto",
  p: 2,
};
