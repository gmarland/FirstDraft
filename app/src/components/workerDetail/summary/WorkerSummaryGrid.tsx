import { Box, Chip, Stack, Typography } from "@mui/material";
import { StatusBadge } from "../../StatusBadge";
import { SummaryCard } from "../../SummaryCard";
import { formatDate, relativeTime } from "../../../lib/dates";
import type { WorkerRegistration } from "../../../types/api";

type Props = {
  state?: WorkerRegistration;
};

export function WorkerSummaryGrid({ state }: Props) {
  const skills = state?.skills ?? [];
  const activeTaskCount =
    state?.activeTaskCount ??
    state?.activeTransactionIds?.length ??
    (state?.currentTransactionId ? 1 : 0);
  const maxConcurrentTasksLabel = state?.maxConcurrentTasks == null ? "unlimited" : state.maxConcurrentTasks.toString();

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "repeat(4, minmax(0, 1fr))" },
        gap: 1.5,
      }}
    >
      <SummaryCard label="Status">
        <Stack
          direction="row"
          spacing={0.75}
          useFlexGap
          sx={{ flexWrap: "wrap" }}
        >
          {state ? (
            <StatusBadge value={state.state} />
          ) : (
            <Chip size="small" label="Loading" sx={{ fontWeight: 800 }} />
          )}
        </Stack>
      </SummaryCard>
      <SummaryCard label="Task slots">
        <Typography sx={{ fontWeight: 800 }}>
          {state ? `${activeTaskCount} / ${maxConcurrentTasksLabel}` : "Loading"}
        </Typography>
      </SummaryCard>
      <SummaryCard label="Skills">
        <Stack
          direction="row"
          spacing={0.75}
          useFlexGap
          sx={{ flexWrap: "wrap" }}
        >
          {skills.length > 0 ? (
            skills.map((skill) => (
              <Chip key={skill} size="small" label={skill} />
            ))
          ) : (
            <strong>None</strong>
          )}
        </Stack>
      </SummaryCard>
      <SummaryCard label="Last seen">
        <Typography
          sx={{ fontWeight: 800 }}
          title={formatDate(state?.lastSeenAt)}
        >
          {relativeTime(state?.lastSeenAt)}
        </Typography>
      </SummaryCard>
    </Box>
  );
}
