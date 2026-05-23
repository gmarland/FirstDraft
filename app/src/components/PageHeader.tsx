import { ReactNode } from "react";
import { Box, Stack, Typography } from "@mui/material";

type Props = {
  title: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ title, actions }: Props) {
  return (
    <Stack
      direction={{ xs: "column", md: "row" }}
      spacing={2}
      sx={{
        justifyContent: "space-between",
        alignItems: { xs: "stretch", md: "center" },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h1" className="wrap-code">
          {title}
        </Typography>
      </Box>
      {actions}
    </Stack>
  );
}
