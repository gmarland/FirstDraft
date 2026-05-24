import { Chip, TableCell, TableRow } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { StatusBadge } from "../../StatusBadge";
import { formatDate, relativeTime } from "../../../lib/dates";
import { WorkerIdentityCell } from "./cells/WorkerIdentityCell";
import { WorkerSkillsCell } from "./cells/WorkerSkillsCell";
import { WorkerTaskSlotsCell } from "./cells/WorkerTaskSlotsCell";
import { WorkerTaskTypesCell } from "./cells/WorkerTaskTypesCell";
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
      <TableCell>
        <Chip
          size="small"
          label={worker.enabled ? "Enabled" : "Disabled"}
          color={worker.enabled ? "success" : "default"}
          sx={{ fontWeight: 800 }}
        />
      </TableCell>
      <WorkerTaskSlotsCell worker={worker} />
      <WorkerTaskTypesCell taskTypes={worker.enabledTaskTypes} />
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
