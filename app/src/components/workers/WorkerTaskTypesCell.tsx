import { Chip, Stack, TableCell } from "@mui/material";
import type { CommandMode } from "../../types/api";

type Props = {
  taskTypes: CommandMode[];
};

export function WorkerTaskTypesCell({ taskTypes }: Props) {
  return (
    <TableCell>
      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
        {taskTypes.map((taskType) => (
          <Chip key={taskType} size="small" label={formatTaskType(taskType)} />
        ))}
      </Stack>
    </TableCell>
  );
}

export function formatTaskType(taskType: CommandMode): string {
  if (taskType === "ai") return "AI";
  if (taskType === "shell") return "Shell";
  return "Gitflow";
}
