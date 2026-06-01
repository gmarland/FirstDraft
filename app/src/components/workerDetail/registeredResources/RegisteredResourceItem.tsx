import { Paper } from "@mui/material";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export function RegisteredResourceItem({ children }: Props) {
  return (
    <Paper variant="outlined" sx={{ p: 1.25, bgcolor: "background.default" }}>
      {children}
    </Paper>
  );
}
