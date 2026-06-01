import { TableCell, TableRow } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { StatusBadge } from "../../StatusBadge";
import { formatDate, relativeTime } from "../../../lib/dates";
import { WorkerIdentityCell } from "./cells/WorkerIdentityCell";
import { WorkerSkillsCell } from "./cells/WorkerSkillsCell";
import { WorkerTaskSlotsCell } from "./cells/WorkerTaskSlotsCell";
import type { WorkerRegistration } from "../../../types/api";

type Props = {
  worker: WorkerRegistration;
  onSelect(workerId: string): void;
};

export function WorkerTableRow({ worker, onSelect }: Props) {
  return (
    <TableRow
      hover
      onClick={() => onSelect(worker.workerId)}
      sx={{ cursor: "pointer" }}
    >
      <WorkerIdentityCell worker={worker} />
      <TableCell>
        <StatusBadge value={worker.state} />
      </TableCell>
      <WorkerTaskSlotsCell worker={worker} />
      <WorkerSkillsCell skills={worker.skills} />
      <TableCell>{worker.paths.length}</TableCell>
      <TableCell title={formatDate(worker.lastSeenAt)}>
        {relativeTime(worker.lastSeenAt)}
      </TableCell>
      <TableCell align="right">
        <ArrowForwardIcon fontSize="small" />
      </TableCell>
    </TableRow>
  );
}
