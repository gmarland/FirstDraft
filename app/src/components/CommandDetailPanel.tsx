import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Stack,
  Tab as MuiTab,
  Tabs,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DataObjectIcon from "@mui/icons-material/DataObject";
import DescriptionIcon from "@mui/icons-material/Description";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
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
  const [outputFullscreenOpen, setOutputFullscreenOpen] = useState(false);

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
    setOutputFullscreenOpen(false);
  }, [command?.transactionId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

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

  const outputText = output || "No output stored yet.";

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
              <Box className="command-output-wrapper">
                <pre className="code-block command-output-block">
                  {outputText}
                </pre>
                <Tooltip title="Open output fullscreen">
                  <IconButton
                    aria-label="Open output fullscreen"
                    className="command-output-fullscreen-button"
                    size="small"
                    onClick={() => setOutputFullscreenOpen(true)}
                  >
                    <FullscreenIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            )}
          </Stack>
        )}
      </Stack>
      <Dialog
        fullScreen
        open={outputFullscreenOpen}
        onClose={() => setOutputFullscreenOpen(false)}
      >
        <DialogTitle
          sx={{
            alignItems: "center",
            display: "flex",
            justifyContent: "space-between",
            gap: 2,
          }}
        >
          <Box>
            <Typography variant="caption" color="text.secondary">
              Command output
            </Typography>
            <Typography sx={{ fontWeight: 800 }}>
              {shortId(command.transactionId)}
            </Typography>
          </Box>
          <Tooltip title="Close fullscreen output">
            <IconButton
              aria-label="Close fullscreen output"
              edge="end"
              onClick={() => setOutputFullscreenOpen(false)}
            >
              <CloseIcon />
            </IconButton>
          </Tooltip>
        </DialogTitle>
        <DialogContent sx={{ p: 2, pt: 0 }}>
          <pre className="code-block command-output-fullscreen-block">
            {outputText}
          </pre>
        </DialogContent>
      </Dialog>
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

function formatCommandMode(mode: Command["commandMode"]): string {
  return "Gitflow";
}

function formatCommand(command: Command): string {
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
