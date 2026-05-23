import { ReactNode } from "react";
import { Paper, Stack, Typography } from "@mui/material";

type Props = {
  label: string;
  children: ReactNode;
};

export function SummaryCard({ label, children }: Props) {
  return (
    <Paper variant="outlined" sx={{ p: 2, minHeight: 86 }}>
      <Stack spacing={1}>
        <Typography color="text.secondary">{label}</Typography>
        {children}
      </Stack>
    </Paper>
  );
}
