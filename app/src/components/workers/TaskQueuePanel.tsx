import { MouseEvent, useState } from "react";
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
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
import CloseIcon from "@mui/icons-material/Close";
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
  const [selectedCommandId, setSelectedCommandId] = useState<string | null>(
    null,
  );
  const selectedCommand =
    commands.find((command) => command.transactionId === selectedCommandId) ?? null;

  const closeDetail = () => setSelectedCommandId(null);

  if (commands.length === 0 && !loading && total === 0) {
    return (
      <EmptyState title="No active tasks">
        Jira and future integration tasks will appear here after intake.
      </EmptyState>
    );
  }

  return (
    <>
      <Paper variant="outlined">
        <TableContainer>
          <Table size="small" aria-label="Task queue" sx={{ tableLayout: "fixed" }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 132 }}>Status</TableCell>
                <TableCell sx={{ width: 132 }}>Source</TableCell>
                <TableCell>Task</TableCell>
                <TableCell sx={{ width: 180 }}>Worker</TableCell>
                <TableCell sx={{ width: 220 }}>Repository</TableCell>
                <TableCell sx={{ width: 132 }}>Created</TableCell>
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
                    <StatusBadge value={command.status} />
                  </TableCell>
                  <TableCell>
                    <SourceLabel command={command} />
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      title={formatCommandSummary(command)}
                      sx={oneLineTextSx}
                    >
                      {formatCommandSummary(command)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      title={command.workerId ?? "Unassigned"}
                      sx={oneLineTextSx}
                    >
                      {command.workerId ?? "Unassigned"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      title={command.repositoryUrl ?? "-"}
                      sx={oneLineTextSx}
                    >
                      {command.repositoryUrl ?? "-"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" title={formatDate(command.createdAt)}>
                      {relativeTime(command.createdAt)}
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
      <TaskQueueDetailDialog command={selectedCommand} onClose={closeDetail} />
    </>
  );
}

function SourceLabel({ command }: { command: Command }) {
  const source = formatSource(command);
  const label = source.key ? `${source.provider} ${source.key}` : source.provider;

  const stopRowClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.stopPropagation();
  };

  if (command.sourceItemUrl) {
    return (
      <Link
        href={command.sourceItemUrl}
        target="_blank"
        rel="noreferrer"
        onClick={stopRowClick}
        title={label}
        sx={oneLineTextSx}
      >
        {label}
      </Link>
    );
  }

  return (
    <Typography title={label} sx={oneLineTextSx}>
      {label}
    </Typography>
  );
}

function TaskQueueDetailDialog({
  command,
  onClose,
}: {
  command: Command | null;
  onClose(): void;
}) {
  if (!command) {
    return null;
  }

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pr: 7 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Typography component="span" sx={{ fontWeight: 800 }}>
            Task {shortId(command.transactionId)}
          </Typography>
          <StatusBadge value={command.status} />
        </Stack>
        <IconButton
          aria-label="Close task detail"
          onClick={onClose}
          sx={{ position: "absolute", right: 12, top: 12 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
              Task
            </Typography>
            <Typography component="pre" className="code-block" sx={{ whiteSpace: "pre-wrap", m: 0 }}>
              {formatCommandDetail(command)}
            </Typography>
          </Box>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{ alignItems: { sm: "flex-start" } }}
          >
            <Field label="Source" value={formatSourceDetail(command)} />
            <Field label="Mode" value={formatCommandMode(command.commandMode)} />
            <Field label="Created" value={formatDate(command.createdAt)} />
            <Field label="Claimed" value={formatDate(command.claimedAt)} />
            <Field label="Completed" value={formatDate(command.completedAt)} />
          </Stack>
          <Field label="Assigned worker" value={command.workerId ?? "Unassigned"} code />
          <Field label="Repository" value={command.repositoryUrl ?? "-"} code />
          <Field label="Transaction ID" value={command.transactionId} code />
          {command.errorMessage && <Field label="Error" value={command.errorMessage} />}
        </Stack>
      </DialogContent>
    </Dialog>
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
      title: string;
      description: string;
    }>;
    return `${payload.ticketNumber ?? "Gitflow"}: ${
      payload.title ?? payload.description ?? payload.repositoryUrl ?? command.command
    }`;
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
      ticketUrl: string;
      title: string;
      description: string;
    }>;

    return [
      `Repository: ${payload.repositoryUrl ?? ""}`,
      `Source branch: ${payload.sourceBranch ?? ""}`,
      `Target branch for PRs: ${payload.targetBranch ?? payload.sourceBranch ?? ""}`,
      `Ticket: ${payload.ticketNumber ?? ""}`,
      `Ticket URL: ${payload.ticketUrl ?? ""}`,
      `Title: ${payload.title ?? ""}`,
      "",
      payload.description ?? ""
    ].join("\n").trim();
  } catch {
    return command.command;
  }
}

function formatSource(command: Command): { provider: string; key?: string } {
  const provider = command.sourceProvider
    ? titleCase(command.sourceProvider)
    : command.commandMode === "gitflow"
      ? "Manual"
      : "-";
  return { provider, key: command.sourceItemKey };
}

function formatSourceDetail(command: Command): string {
  const source = formatSource(command);
  if (command.sourceItemUrl) {
    return source.key
      ? `${source.provider} ${source.key} (${command.sourceItemUrl})`
      : `${source.provider} (${command.sourceItemUrl})`;
  }
  return source.key ? `${source.provider} ${source.key}` : source.provider;
}

function titleCase(value: string): string {
  return value.length > 0
    ? `${value.slice(0, 1).toUpperCase()}${value.slice(1).toLowerCase()}`
    : value;
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 12)}...` : value;
}

const oneLineTextSx = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  minWidth: 0,
};
