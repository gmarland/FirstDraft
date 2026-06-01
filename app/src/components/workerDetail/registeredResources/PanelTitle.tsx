import { Box, Typography } from "@mui/material";

type Props = {
  caption: string;
  title?: string;
};

export function PanelTitle({ caption, title }: Props) {
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
