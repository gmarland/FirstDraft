import { Box, Paper, Stack, Typography } from "@mui/material";

type Props = {
  paths: string[];
};

export function RegisteredPathsPanel({ paths }: Props) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
            Paths
          </Typography>
          <Typography variant="h2">Registered paths</Typography>
        </Box>
        <Stack spacing={1}>
          {paths.map((path) => (
            <Paper variant="outlined" key={path} sx={{ p: 1.25, bgcolor: "background.default" }}>
              <Typography component="code" className="wrap-code">
                {path}
              </Typography>
            </Paper>
          ))}
          {paths.length === 0 && <Typography color="text.secondary">No paths reported by this worker.</Typography>}
        </Stack>
      </Stack>
    </Paper>
  );
}
