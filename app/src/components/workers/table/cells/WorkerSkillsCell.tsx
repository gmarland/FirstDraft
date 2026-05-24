import { Chip, Stack, TableCell, Typography } from "@mui/material";

type Props = {
  skills: string[];
};

export function WorkerSkillsCell({ skills }: Props) {
  return (
    <TableCell>
      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
        {skills.length > 0 ? (
          skills.map((skill) => <Chip key={skill} size="small" label={skill} />)
        ) : (
          <Typography variant="body2">None</Typography>
        )}
      </Stack>
    </TableCell>
  );
}
