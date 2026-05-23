import { Chip } from "@mui/material";
import type { ClientState, CommandStatus } from "../types/api";

type Props = {
  value: ClientState | CommandStatus;
};

const labels: Record<Props["value"], string> = {
  started: "Idle",
  running_command: "Running",
  stopped: "Offline",
  queued: "Queued",
  in_progress: "In progress",
  completed: "Completed",
  failed: "Failed"
};

export function StatusBadge({ value }: Props) {
  return <Chip size="small" label={labels[value]} color={colorFor(value)} sx={{ fontWeight: 800 }} />;
}

function colorFor(value: Props["value"]): "success" | "warning" | "error" | "default" | "primary" {
  if (value === "stopped" || value === "failed") return "error";
  if (value === "running_command" || value === "in_progress" || value === "queued") return "primary";
  if (value === "started" || value === "completed") return "success";
  return "default";
}
