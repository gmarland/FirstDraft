import { Box, Chip, Stack, Typography } from "@mui/material";
import { StatusBadge } from "../StatusBadge";
import { SummaryCard } from "../SummaryCard";
import { formatDate, relativeTime } from "../../lib/dates";
import { formatTaskType } from "../workers/table/cells/WorkerTaskTypesCell";
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

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "repeat(5, minmax(0, 1fr))" },
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
          <Chip
            size="small"
            label={
              state?.enabled === false
                ? "Disabled"
                : state
                  ? "Enabled"
                  : "Loading"
            }
            color={state?.enabled === false ? "default" : "success"}
            sx={{ fontWeight: 800 }}
          />
          {state ? (
            <StatusBadge value={state.state} />
          ) : (
            <Chip size="small" label="Loading" sx={{ fontWeight: 800 }} />
          )}
        </Stack>
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
            <Chip
              key={taskType}
              size="small"
              label={formatTaskType(taskType)}
            />
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
