import { Box, Chip, List, ListItemButton, Stack, Typography } from "@mui/material";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import TerminalIcon from "@mui/icons-material/Terminal";
import { formatDate, relativeTime } from "../lib/dates";
import type { Command } from "../types/api";
import { StatusBadge } from "./StatusBadge";

type Props = {
  commands: Command[];
  selectedId?: string;
  onSelect(command: Command): void;
};

export function CommandTimeline({ commands, selectedId, onSelect }: Props) {
  return (
    <List disablePadding sx={{ display: "grid", gap: 1 }}>
      {commands.map((command) => (
        <ListItemButton
          selected={selectedId === command.transactionId}
          key={command.transactionId}
          onClick={() => onSelect(command)}
          sx={{ alignItems: "flex-start", border: "1px solid", borderColor: "divider", borderRadius: 1 }}
        >
          <CommandModeIcon mode={command.commandMode} />
          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", mb: 1 }}>
              <StatusBadge value={command.status} />
              <Chip size="small" label={formatCommandMode(command.commandMode)} />
              <Typography variant="body2" color="text.secondary" title={formatDate(command.createdAt)}>
                {relativeTime(command.createdAt)}
              </Typography>
            </Stack>
            <Typography component="code" className="wrap-code" sx={{ display: "block" }}>
              {formatCommand(command)}
            </Typography>
            {command.errorMessage && (
              <Typography color="error" variant="body2" sx={{ mt: 0.75 }}>
                {command.errorMessage}
              </Typography>
            )}
          </Box>
        </ListItemButton>
      ))}
    </List>
  );
}

function CommandModeIcon({ mode }: { mode: Command["commandMode"] }) {
  const sx = { mr: 1.25, mt: 0.4 };
  if (mode === "shell") return <TerminalIcon fontSize="small" sx={sx} />;
  if (mode === "gitflow") return <AccountTreeIcon fontSize="small" sx={sx} />;
  return <AutoAwesomeIcon fontSize="small" sx={sx} />;
}

function formatCommandMode(mode: Command["commandMode"]): string {
  if (mode === "shell") return "Shell";
  if (mode === "gitflow") return "Gitflow";
  return "AI";
}

function formatCommand(command: Command): string {
  if (command.commandMode !== "gitflow") return command.command;

  try {
    const payload = JSON.parse(command.command) as Partial<{
      repositoryUrl: string;
      sourceBranch: string;
      ticketNumber: string;
      description: string;
    }>;
    return `${payload.ticketNumber ?? "Gitflow"}: ${payload.description ?? payload.repositoryUrl ?? command.command}`;
  } catch {
    return command.command;
  }
}
