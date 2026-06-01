import { Box } from "@mui/material";
import { RegisteredPathsPanel } from "./RegisteredPathsPanel";

type Props = {
  paths: string[];
};

export function WorkerPanelsGrid({ paths }: Props) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "1fr", gap: 2 }}>
      <RegisteredPathsPanel paths={paths} />
    </Box>
  );
}
