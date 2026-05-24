import { TableCell, Typography } from "@mui/material";
import { formatDate, relativeTime } from "../../../../lib/dates";
import type { WorkerRegistration } from "../../../../types/api";

type Props = {
  worker: Pick<WorkerRegistration, "workerId" | "registeredAt">;
};

export function WorkerIdentityCell({ worker }: Props) {
  return (
    <TableCell>
      <Typography sx={{ fontWeight: 800 }}>{worker.workerId}</Typography>
      <Typography
        variant="body2"
        color="text.secondary"
        title={formatDate(worker.registeredAt)}
      >
        Registered {relativeTime(worker.registeredAt)}
      </Typography>
    </TableCell>
  );
}
