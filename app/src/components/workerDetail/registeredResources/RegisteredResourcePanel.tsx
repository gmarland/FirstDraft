import { Paper, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { PanelTitle } from "./PanelTitle";

type RegisteredResourcePanelProps = {
  caption: string;
  title?: string;
  emptyMessage: string;
  empty: boolean;
  children: ReactNode;
};

export function RegisteredResourcePanel({
  caption,
  title,
  emptyMessage,
  empty,
  children,
}: RegisteredResourcePanelProps) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <PanelTitle caption={caption} title={title} />
        <Stack spacing={1}>
          {children}
          {empty && <Typography color="text.secondary">{emptyMessage}</Typography>}
        </Stack>
      </Stack>
    </Paper>
  );
}
