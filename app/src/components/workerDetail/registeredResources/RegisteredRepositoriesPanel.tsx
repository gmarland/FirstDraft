import { Chip, Stack, Typography } from "@mui/material";
import { formatDate, relativeTime } from "../../../lib/dates";
import type { GitRepositorySuggestion } from "../../../types/api";
import { RegisteredResourceItem } from "./RegisteredResourceItem";
import { RegisteredResourcePanel } from "./RegisteredResourcePanel";

type Props = {
  repositories: GitRepositorySuggestion[];
};

export function RegisteredRepositoriesPanel({ repositories }: Props) {
  return (
    <RegisteredResourcePanel
      caption="Git"
      empty={repositories.length === 0}
      emptyMessage="No repositories reported by this worker."
    >
      {repositories.map((repository) => (
        <RegisteredResourceItem key={repository.normalizedRepositoryUrl}>
          <Stack spacing={1}>
            <Typography component="code" className="wrap-code">
              {repository.repositoryUrl}
            </Typography>
            <Stack
              direction="row"
              spacing={0.75}
              useFlexGap
              sx={{ flexWrap: "wrap" }}
            >
              <Chip size="small" label={`Source ${repository.sourceBranch}`} />
              <Chip size="small" label={`Target ${repository.targetBranch}`} />
            </Stack>
            <Typography
              variant="caption"
              color="text.secondary"
              title={formatDate(repository.lastUsedAt)}
            >
              Last registered {relativeTime(repository.lastUsedAt)}
            </Typography>
          </Stack>
        </RegisteredResourceItem>
      ))}
    </RegisteredResourcePanel>
  );
}
