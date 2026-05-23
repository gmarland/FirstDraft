import { ReactNode } from "react";
import { Paper, Stack, Typography } from "@mui/material";

type Props = {
  title: string;
  children: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ title, children, action }: Props) {
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={1.5} sx={{ alignItems: "flex-start" }}>
        <Typography variant="h2">{title}</Typography>
        <Typography color="text.secondary">{children}</Typography>
      {action}
      </Stack>
    </Paper>
  );
}
