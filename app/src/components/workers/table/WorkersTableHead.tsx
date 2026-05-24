import { TableCell, TableHead, TableRow } from "@mui/material";

export function WorkersTableHead() {
  return (
    <TableHead>
      <TableRow>
        <TableCell>Worker</TableCell>
        <TableCell>State</TableCell>
        <TableCell>Enabled</TableCell>
        <TableCell>Task slots</TableCell>
        <TableCell>Task types</TableCell>
        <TableCell>Skills</TableCell>
        <TableCell>Paths</TableCell>
        <TableCell>Last seen</TableCell>
        <TableCell align="right" />
      </TableRow>
    </TableHead>
  );
}
