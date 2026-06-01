import { TableCell } from "@mui/material";
import { getWorkerTaskSlots } from "../workerTaskSlots";
import type { WorkerRegistration } from "../../../../types/api";

type Props = {
  worker: WorkerRegistration;
};

export function WorkerTaskSlotsCell({ worker }: Props) {
  const { activeTaskCount, maxConcurrentTasksLabel } = getWorkerTaskSlots(worker);

  return (
    <TableCell>
      {activeTaskCount} / {maxConcurrentTasksLabel}
    </TableCell>
  );
}
