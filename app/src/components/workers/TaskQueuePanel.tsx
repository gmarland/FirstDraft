import { MouseEvent, useState } from "react";
import {
  Box,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  Link,
  MenuItem,
  OutlinedInput,
  Paper,
  Select,
  SelectChangeEvent,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { EmptyState } from "../EmptyState";
import { StatusBadge } from "../StatusBadge";
import { formatDate, relativeTime } from "../../lib/dates";
import type {
  Command,
  CommandStatus,
  TaskQueueSortBy,
  TaskQueueSortDirection,
} from "../../types/api";

type Props = {
  currentUserId?: string;
  commands: Command[];
  total: number;
  page: number;
  pageSize: number;
  selectedStatuses: CommandStatus[];
  sortBy?: TaskQueueSortBy;
  sortDirection?: TaskQueueSortDirection;
  loading: boolean;
  onPageChange(page: number): void;
  onPageSizeChange(pageSize: number): void;
  onStatusesChange(statuses: CommandStatus[]): void;
  onSortChange(
    sortBy: TaskQueueSortBy,
    sortDirection: TaskQueueSortDirection,
  ): void;
};

type SortableColumn = {
  key: TaskQueueSortBy;
  label: string;
  width?: number;
  firstDirection: TaskQueueSortDirection;
};

const statusOptions: Array<{ value: CommandStatus; label: string }> = [
  { value: "queued", label: "Queued" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

const defaultStatusFilter = statusOptions.map((option) => option.value);

const sortableColumns: SortableColumn[] = [
  { key: "status", label: "Status", width: 132, firstDirection: "asc" },
  { key: "source", label: "Source", width: 132, firstDirection: "asc" },
  { key: "task", label: "Task", firstDirection: "asc" },
  { key: "worker", label: "Worker", width: 180, firstDirection: "asc" },
  { key: "repository", label: "Repository", width: 220, firstDirection: "asc" },
  { key: "created", label: "Created", width: 132, firstDirection: "desc" },
];

export function TaskQueuePanel({
  currentUserId,
  commands,
  total,
  page,
  pageSize,
  selectedStatuses,
  sortBy,
  sortDirection = "asc",
  loading,
  onPageChange,
  onPageSizeChange,
  onStatusesChange,
  onSortChange,
}: Props) {
  const [selectedCommandId, setSelectedCommandId] = useState<string | null>(
    null,
  );
  const selectedCommand =
    commands.find((command) => command.transactionId === selectedCommandId) ??
    null;

  const closeDetail = () => setSelectedCommandId(null);
  const changeSort = (column: SortableColumn) => {
    const nextDirection =
      sortBy === column.key
        ? sortDirection === "asc"
          ? "desc"
          : "asc"
        : column.firstDirection;
    onSortChange(column.key, nextDirection);
  };
  const changeStatuses = (event: SelectChangeEvent<CommandStatus[]>) => {
    const value = event.target.value;
    const nextStatuses =
      typeof value === "string"
        ? value.split(",").filter(isCommandStatus)
        : value;
    onStatusesChange(nextStatuses.length > 0 ? nextStatuses : defaultStatusFilter);
  };
  const statusFilter = (
    <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
      <FormControl size="small" sx={{ minWidth: 260 }}>
        <InputLabel id="task-status-filter-label">Status</InputLabel>
        <Select
          labelId="task-status-filter-label"
          multiple
          value={selectedStatuses}
          onChange={changeStatuses}
          input={<OutlinedInput label="Status" />}
          renderValue={(selected) => (
            <Stack
              direction="row"
              spacing={0.75}
              sx={{ flexWrap: "wrap", gap: 0.75 }}
            >
              {selected.map((status) => (
                <StatusBadge key={status} value={status} />
              ))}
            </Stack>
          )}
        >
          {statusOptions.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              <Checkbox checked={selectedStatuses.includes(option.value)} />
              <Typography>{option.label}</Typography>
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );

  if (commands.length === 0 && !loading && total === 0) {
    return (
      <Stack spacing={1.5}>
        {statusFilter}
        <EmptyState
          title={
            isDefaultStatusFilter(selectedStatuses)
              ? "No active tasks"
              : "No matching tasks"
          }
        >
          {isDefaultStatusFilter(selectedStatuses)
            ? "Tasks will appear here after intake."
            : "No tasks match the selected statuses."}
        </EmptyState>
      </Stack>
    );
  }

  return (
    <>
      <Stack spacing={1.5}>
        {statusFilter}
        <Paper variant="outlined">
          <TableContainer>
            <Table
              size="small"
              aria-label="Task queue"
              sx={{ tableLayout: "fixed" }}
            >
              <TableHead>
                <TableRow>
                  {sortableColumns.map((column) => (
                    <TableCell key={column.key} sx={{ width: column.width }}>
                      <TableSortLabel
                        active={sortBy === column.key}
                        direction={
                          sortBy === column.key
                            ? sortDirection
                            : column.firstDirection
                        }
                        onClick={() => changeSort(column)}
                      >
                        {column.label}
                      </TableSortLabel>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {commands.map((command) => {
                  const workerLabel = formatWorkerLabel(command, currentUserId);

                  return (
                    <TableRow
                      hover
                      selected={
                        selectedCommand?.transactionId === command.transactionId
                      }
                      key={command.transactionId}
                      onClick={() =>
                        setSelectedCommandId(command.transactionId)
                      }
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
                          title={workerLabel}
                          sx={oneLineTextSx}
                        >
                          {workerLabel}
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
                        <Typography
                          variant="body2"
                          title={formatDate(command.createdAt)}
                        >
                          {relativeTime(command.createdAt)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  );
                })}
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
              onRowsPerPageChange={(event) =>
                onPageSizeChange(Number(event.target.value))
              }
            />
          )}
        </Paper>
      </Stack>
      <TaskQueueDetailDialog
        command={selectedCommand}
        currentUserId={currentUserId}
        onClose={closeDetail}
      />
    </>
  );
}

function isCommandStatus(value: string): value is CommandStatus {
  return statusOptions.some((option) => option.value === value);
}

function isDefaultStatusFilter(statuses: CommandStatus[]): boolean {
  return (
    statuses.length === defaultStatusFilter.length &&
    defaultStatusFilter.every((status) => statuses.includes(status))
  );
}

function SourceLabel({ command }: { command: Command }) {
  const source = formatSource(command);
  const label = source.key
    ? `${source.provider} ${source.key}`
    : source.provider;

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
  currentUserId,
  onClose,
}: {
  command: Command | null;
  currentUserId?: string;
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
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 800 }}
            >
              Task
            </Typography>
            <Typography
              component="pre"
              className="code-block"
              sx={{ whiteSpace: "pre-wrap", m: 0 }}
            >
              {formatCommandDetail(command)}
            </Typography>
          </Box>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{ alignItems: { sm: "flex-start" } }}
          >
            <Field label="Source" value={formatSourceDetail(command)} />
            <Field
              label="Mode"
              value={formatCommandMode(command.commandMode)}
            />
            <Field label="Created" value={formatDate(command.createdAt)} />
            <Field label="Claimed" value={formatDate(command.claimedAt)} />
            <Field label="Completed" value={formatDate(command.completedAt)} />
          </Stack>
          <Field
            label="Assigned worker"
            value={formatWorkerLabel(command, currentUserId)}
            code
          />
          <Field label="Repository" value={command.repositoryUrl ?? "-"} code />
          <Field label="Transaction ID" value={command.transactionId} code />
          {command.errorMessage && (
            <Field label="Error" value={command.errorMessage} />
          )}
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
  if (command.taskSummary) return command.taskSummary;
  if (command.commandMode !== "gitflow") return command.command;

  try {
    const payload = JSON.parse(command.command) as Partial<{
      repositoryUrl: string;
      ticketNumber: string;
      title: string;
      description: string;
    }>;
    return `${payload.ticketNumber ?? "Gitflow"}: ${
      payload.title ??
      payload.description ??
      payload.repositoryUrl ??
      command.command
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
      payload.description ?? "",
    ]
      .join("\n")
      .trim();
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

function formatWorkerLabel(command: Command, currentUserId?: string): string {
  if (!command.workerId) return "Unassigned";
  if (
    currentUserId &&
    command.workerOwnerUserId &&
    command.workerOwnerUserId !== currentUserId
  ) {
    return (
      command.workerOwnerName ?? command.workerOwnerEmail ?? command.workerId
    );
  }
  return command.workerId;
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
