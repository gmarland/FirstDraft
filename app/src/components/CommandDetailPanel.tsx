import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Divider,
  Paper,
  Stack,
  Tab as MuiTab,
  Tabs,
  Typography,
} from "@mui/material";
import CancelIcon from "@mui/icons-material/Cancel";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DataObjectIcon from "@mui/icons-material/DataObject";
import DescriptionIcon from "@mui/icons-material/Description";
import InfoIcon from "@mui/icons-material/Info";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatBytes, formatDate } from "../lib/dates";
import type { Command } from "../types/api";
import { StatusBadge } from "./StatusBadge";

type Props = {
  workerId: string;
  command: Command | null;
  onCommandChanged(): Promise<void>;
};

type DetailTab = "summary" | "responses" | "output";

export function CommandDetailPanel({ workerId, command, onCommandChanged }: Props) {
  const { token } = useAuth();
  const [tab, setTab] = useState<DetailTab>("summary");
  const [responses, setResponses] = useState<unknown>(null);
  const [output, setOutput] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!token || !command || tab === "summary") return;

    setLoading(true);
    setError(null);
    try {
      if (tab === "responses") {
        setResponses(
          await api.getCommandResponses(
            token,
            workerId,
            command.transactionId,
          ),
        );
      } else {
        setOutput(
          formatCommandOutput(
            await api.getCommandOutput(
              token,
              workerId,
              command.transactionId,
            ),
          ),
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load command detail",
      );
    } finally {
      setLoading(false);
    }
  }, [workerId, command, tab, token]);

  useEffect(() => {
    setResponses(null);
    setOutput("");
    setError(null);
  }, [command?.transactionId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const cancelCommand = useCallback(async () => {
    if (!token || !command || !canCancelCommand(command)) return;

    setCancelling(true);
    setError(null);
    try {
      await api.cancelCommand(token, workerId, command.transactionId);
      await onCommandChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to cancel command");
    } finally {
      setCancelling(false);
    }
  }, [workerId, command, onCommandChanged, token]);

  if (!command) {
    return (
      <Paper variant="outlined" sx={panelSx}>
        <Stack spacing={1} color="text.secondary">
          <InfoIcon />
          <Typography>
            Select a command to inspect metadata, parsed responses, and raw
            output.
          </Typography>
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={panelSx}>
      <Stack spacing={2}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ justifyContent: "space-between", alignItems: "center" }}
        >
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 800 }}
            >
              Command
            </Typography>
            <Typography sx={{ fontWeight: 800 }}>
              {shortId(command.transactionId)}
            </Typography>
          </Box>
          <StatusBadge value={command.status} />
        </Stack>

        <Tabs
          value={tab}
          onChange={(_, value: DetailTab) => setTab(value)}
          variant="fullWidth"
        >
          <MuiTab
            value="summary"
            icon={<InfoIcon />}
            iconPosition="start"
            label="Summary"
          />
          <MuiTab
            value="output"
            icon={<DescriptionIcon />}
            iconPosition="start"
            label="Output"
          />
        </Tabs>
        <Divider />

        {tab === "summary" && (
          <Stack spacing={1.5}>
            <Field label="Command" value={formatCommand(command)} code />
            <Field
              label="Mode"
              value={formatCommandMode(command.commandMode)}
            />
            <Field label="Created" value={formatDate(command.createdAt)} />
            <Field label="Claimed" value={formatDate(command.claimedAt)} />
            <Field label="Completed" value={formatDate(command.completedAt)} />
            {command.errorMessage && (
              <Field label="Error" value={command.errorMessage} error />
            )}
            {canCancelCommand(command) && (
              <Button
                variant="outlined"
                color="error"
                startIcon={<CancelIcon />}
                disabled={cancelling}
                onClick={() => void cancelCommand()}
              >
                {cancelling ? "Cancelling..." : "Cancel command"}
              </Button>
            )}
            <Button
              variant="outlined"
              startIcon={<ContentCopyIcon />}
              onClick={() =>
                void navigator.clipboard.writeText(command.transactionId)
              }
            >
              Copy transaction ID
            </Button>
          </Stack>
        )}

        {tab !== "summary" && (
          <Stack spacing={1.5}>
            {loading && (
              <Typography color="text.secondary">Loading...</Typography>
            )}
            {error && <Alert severity="error">{error}</Alert>}
            {!loading && !error && tab === "output" && (
              <pre className="code-block">
                {output || "No output stored yet."}
              </pre>
            )}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

function Field({
  label,
  value,
  code,
  error,
}: {
  label: string;
  value: string;
  code?: boolean;
  error?: boolean;
}) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      {code ? (
        <Typography
          component="code"
          className="wrap-code"
          sx={{ display: "block" }}
        >
          {value}
        </Typography>
      ) : (
        <Typography
          sx={{ fontWeight: 800 }}
          color={error ? "error" : "text.primary"}
          className="wrap-code"
        >
          {value}
        </Typography>
      )}
    </Box>
  );
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 12)}...` : value;
}

function canCancelCommand(command: Command): boolean {
  return command.status === "queued" || command.status === "in_progress";
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
      targetBranch: string;
      ticketNumber: string;
      description: string;
    }>;

    return [
      `Repository: ${payload.repositoryUrl ?? ""}`,
      `Source branch: ${payload.sourceBranch ?? ""}`,
      `Target branch for PRs: ${payload.targetBranch ?? payload.sourceBranch ?? ""}`,
      `Ticket: ${payload.ticketNumber ?? ""}`,
      "",
      payload.description ?? ""
    ].join("\n").trim();
  } catch {
    return command.command;
  }
}

function formatCommandOutput(rawOutput: string): string {
  const lines = rawOutput.split("\n").filter((line) => line.trim());
  if (lines.length === 0) return "";

  const textChunks: string[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as { text?: unknown };
      if (typeof parsed.text !== "string") return rawOutput;
      textChunks.push(parsed.text);
    } catch {
      return rawOutput;
    }
  }

  return textChunks.join("\n");
}

const panelSx = {
  position: { md: "sticky" },
  top: { md: 84 },
  maxHeight: { md: "calc(100vh - 112px)" },
  overflow: "auto",
  p: 2,
};
