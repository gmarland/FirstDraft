import { Box, Paper, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

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

export function RegisteredResourceItem({ children }: { children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.25, bgcolor: "background.default" }}>
      {children}
    </Paper>
  );
}

export function ResourceField({
  label,
  value,
  code = false,
}: {
  label?: string;
  value: string;
  code?: boolean;
}) {
  return (
    <Box>
      {label && (
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      )}
      <Typography
        component={code ? "code" : "div"}
        className={code ? "wrap-code" : undefined}
        sx={{ fontWeight: code ? 400 : 700 }}
      >
        {value || "-"}
      </Typography>
    </Box>
  );
}

function PanelTitle({ caption, title }: { caption: string; title?: string }) {
  return (
    <Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontWeight: 800 }}
      >
        {caption}
      </Typography>
      {title && <Typography variant="h2">{title}</Typography>}
    </Box>
  );
}
