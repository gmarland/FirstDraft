import { ReactNode } from "react";
import { Box, Card, CardContent } from "@mui/material";

type Props = {
  maxWidth: number;
  children: ReactNode;
};

export function AuthPageLayout({ maxWidth, children }: Props) {
  return (
    <Box component="main" sx={authPageSx}>
      <Card variant="outlined" sx={{ width: `min(${maxWidth}px, 100%)` }}>
        <CardContent>{children}</CardContent>
      </Card>
    </Box>
  );
}

const authPageSx = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  p: 3,
  bgcolor: "#eef3f5",
  background: "linear-gradient(135deg, rgba(35, 100, 170, 0.14), transparent 40%), #eef3f5",
};
