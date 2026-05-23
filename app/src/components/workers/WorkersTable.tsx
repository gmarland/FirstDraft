import {
  Paper,
  Table,
  TableBody,
  TableContainer,
} from "@mui/material";
import { WorkerTableRow } from "./WorkerTableRow";
import { WorkersTableHead } from "./WorkersTableHead";
import type { WorkerRegistration } from "../../types/api";

type Props = {
  workers: WorkerRegistration[];
  onSelect(workerId: string): void;
};

export function WorkersTable({ workers, onSelect }: Props) {
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table>
        <WorkersTableHead />
        <TableBody>
          {workers.map((worker) => (
            <WorkerTableRow
              key={worker.workerId}
              worker={worker}
              onSelect={onSelect}
            />
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
