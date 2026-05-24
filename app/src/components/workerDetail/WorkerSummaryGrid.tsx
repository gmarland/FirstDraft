import { Box, Chip, Stack, Typography } from "@mui/material";
import { StatusBadge } from "../StatusBadge";
import { SummaryCard } from "../SummaryCard";
import { formatDate, relativeTime } from "../../lib/dates";
import { formatTaskType } from "../workers/WorkerTaskTypesCell";
import type { WorkerRegistration } from "../../types/api";

type Props = {
  state?: WorkerRegistration;
};

export function WorkerSummaryGrid({ state }: Props) {
  const skills = state?.skills ?? [];
  const enabledTaskTypes = state?.enabledTaskTypes ?? [];
  const activeTaskCount =
    state?.activeTaskCount ??
    state?.activeTransactionIds?.length ??
    (state?.currentTransactionId ? 1 : 0);
  const maxConcurrentTasks = state?.maxConcurrentTasks ?? 1;
  const activeTransactions =
    state?.activeTransactionIds ??
    (state?.currentTransactionId ? [state.currentTransactionId] : []);

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "repeat(5, minmax(0, 1fr))" },
        gap: 1.5,
      }}
    >
      <SummaryCard label="State">
        {state ? <StatusBadge value={state.state} /> : <strong>Loading</strong>}
      </SummaryCard>
      <SummaryCard label="Task slots">
        <Typography sx={{ fontWeight: 800 }}>
          {state ? `${activeTaskCount} / ${maxConcurrentTasks}` : "Loading"}
        </Typography>
      </SummaryCard>
      <SummaryCard label="Task types">
        <Stack
          direction="row"
          spacing={0.75}
          useFlexGap
          sx={{ flexWrap: "wrap" }}
        >
          {enabledTaskTypes.map((taskType) => (
            <Chip key={taskType} size="small" label={formatTaskType(taskType)} />
          ))}
        </Stack>
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
