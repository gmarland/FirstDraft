import { Box, Stack, Typography } from "@mui/material";
import HubIcon from "@mui/icons-material/Hub";

type Props = {
  title: string;
};

export function AuthHeader({ title }: Props) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
      <HubIcon color="primary" fontSize="large" />
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
          FirstDraft
        </Typography>
        <Typography variant="h1">{title}</Typography>
      </Box>
    </Stack>
  );
}
