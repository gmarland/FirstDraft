import { Chip, Stack, Typography } from "@mui/material";

type Props = {
  title: string;
  complete: boolean;
};

export function SectionTitle({ title, complete }: Props) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      <Typography variant="h2">{title}</Typography>
      {complete && <Chip size="small" color="success" label="Complete" />}
    </Stack>
  );
}
