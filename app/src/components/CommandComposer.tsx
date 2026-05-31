import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import SendIcon from "@mui/icons-material/Send";
import TerminalIcon from "@mui/icons-material/Terminal";
import type { CommandMode, GitRepositorySuggestion } from "../types/api";

type GitflowForm = {
  repositoryUrl: string;
  sourceBranch: string;
  targetBranch: string;
  ticketNumber: string;
  description: string;
};

type Props = {
  disabled?: boolean;
  fixedCommandMode?: CommandMode;
  gitflowContinuation?: boolean;
  placeholder?: string;
  supportedSkills?: string[];
  enabledTaskTypes?: CommandMode[];
  gitRepositorySuggestions?: GitRepositorySuggestion[];
  onSubmit(command: string, commandMode: CommandMode): Promise<void>;
};

export function CommandComposer({
  disabled,
  fixedCommandMode,
  gitflowContinuation = false,
  placeholder,
  supportedSkills = [],
  enabledTaskTypes,
  gitRepositorySuggestions = [],
  onSubmit,
}: Props) {
  const [command, setCommand] = useState("");
  const [selectedCommandMode, setSelectedCommandMode] = useState<CommandMode>(
    fixedCommandMode ?? "ai",
  );
  const [gitflow, setGitflow] = useState<GitflowForm>({
    repositoryUrl: "",
    sourceBranch: "main",
    targetBranch: "main",
    ticketNumber: "",
    description: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedSkills = useMemo(
    () => supportedSkills.map((skill) => skill.toLowerCase()),
    [supportedSkills],
  );
  const acceptedTaskTypes = useMemo(
    () => normalizeEnabledTaskTypes(enabledTaskTypes),
    [enabledTaskTypes],
  );
  const availableCommandModes = useMemo(
    () =>
      (["ai", "shell", "gitflow"] as const).filter(
        (mode): mode is CommandMode =>
          isCommandModeSupported(mode, normalizedSkills, acceptedTaskTypes),
      ),
    [normalizedSkills, acceptedTaskTypes],
  );
  const commandMode = fixedCommandMode ?? selectedCommandMode;
  const commandModeSupported = isCommandModeSupported(
    commandMode,
    normalizedSkills,
    acceptedTaskTypes,
  );
  const noAcceptedTaskTypes = acceptedTaskTypes.length === 0;
  const selectedRepository = useMemo(
    () =>
      gitRepositorySuggestions.find(
        (repository) => repository.repositoryUrl === gitflow.repositoryUrl,
      ),
    [gitRepositorySuggestions, gitflow.repositoryUrl],
  );

  useEffect(() => {
    if (fixedCommandMode) {
      setSelectedCommandMode(fixedCommandMode);
      return;
    }

    if (
      !isCommandModeSupported(
        selectedCommandMode,
        normalizedSkills,
        acceptedTaskTypes,
      )
    ) {
      const nextMode = acceptedTaskTypes.find((mode) =>
        isCommandModeSupported(mode, normalizedSkills, acceptedTaskTypes),
      );
      if (nextMode) setSelectedCommandMode(nextMode);
    }
  }, [
    fixedCommandMode,
    selectedCommandMode,
    normalizedSkills,
    acceptedTaskTypes,
  ]);

  useEffect(() => {
    if (gitflowContinuation || commandMode !== "gitflow") return;
    if (gitflow.repositoryUrl || gitRepositorySuggestions.length === 0) return;

    const repository = gitRepositorySuggestions[0];
    setGitflow((current) => ({
      ...current,
      repositoryUrl: repository.repositoryUrl,
      sourceBranch: repository.sourceBranch,
      targetBranch: repository.targetBranch,
    }));
  }, [
    commandMode,
    gitRepositorySuggestions,
    gitflow.repositoryUrl,
    gitflowContinuation,
  ]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const payload = buildPayload(
      commandMode,
      command,
      gitflow,
      gitflowContinuation,
    );
    if (!payload) return;

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(payload, commandMode);
      if (commandMode === "gitflow" && !gitflowContinuation) {
        setGitflow((current) => ({
          ...current,
          ticketNumber: "",
          description: "",
        }));
      } else {
        setCommand("");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Command failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack component="form" spacing={1.5} onSubmit={submit}>
      {!fixedCommandMode && (
        <ToggleButtonGroup
          exclusive
          size="small"
          value={commandMode}
          onChange={(_, value: CommandMode | null) => {
            if (
              value &&
              isCommandModeSupported(value, normalizedSkills, acceptedTaskTypes)
            )
              setSelectedCommandMode(value);
          }}
          disabled={disabled || submitting}
          aria-label="Command mode"
        >
          {availableCommandModes.includes("ai") && (
            <ToggleButton value="ai" aria-label="AI command">
              <AutoAwesomeIcon fontSize="small" sx={{ mr: 0.75 }} />
              AI
            </ToggleButton>
          )}
          {availableCommandModes.includes("shell") && (
            <ToggleButton value="shell" aria-label="Shell command">
              <TerminalIcon fontSize="small" sx={{ mr: 0.75 }} />
              Shell
            </ToggleButton>
          )}
          {availableCommandModes.includes("gitflow") && (
            <ToggleButton value="gitflow" aria-label="Gitflow command">
              <AccountTreeIcon fontSize="small" sx={{ mr: 0.75 }} />
              Gitflow
            </ToggleButton>
          )}
        </ToggleButtonGroup>
      )}
      {commandMode === "gitflow" && !gitflowContinuation ? (
        <Stack spacing={1.5}>
          <Autocomplete
            options={gitRepositorySuggestions}
            value={selectedRepository ?? null}
            getOptionLabel={(option) =>
              option.repositoryUrl
            }
            isOptionEqualToValue={(option, value) =>
              option.normalizedRepositoryUrl === value.normalizedRepositoryUrl
            }
            onChange={(_, value) => {
              if (!value) {
                setGitflow((current) => ({
                  ...current,
                  repositoryUrl: "",
                  sourceBranch: "",
                  targetBranch: "",
                }));
                return;
              }
              setGitflow((current) => ({
                ...current,
                repositoryUrl: value.repositoryUrl,
                sourceBranch: value.sourceBranch,
                targetBranch: value.targetBranch,
              }));
            }}
            disabled={disabled || submitting || !commandModeSupported}
            renderInput={(params) => (
              <TextField {...params} label="Repository URL" fullWidth />
            )}
            renderOption={(props, option) => (
              <Box
                component="li"
                {...props}
                sx={{ alignItems: "flex-start !important", gap: 1 }}
              >
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                  <Typography className="wrap-code" sx={{ fontWeight: 800 }}>
                    {option.repositoryUrl}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {option.sourceBranch} {"->"} {option.targetBranch}
                  </Typography>
                </Box>
              </Box>
            )}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              value={gitflow.sourceBranch}
              disabled={disabled || submitting || !commandModeSupported}
              fullWidth
              label="Source branch"
            />
            <TextField
              value={gitflow.targetBranch}
              disabled={disabled || submitting || !commandModeSupported}
              fullWidth
              label="Target branch for PRs"
            />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Ticket number"
              value={gitflow.ticketNumber}
              onChange={(event) =>
                setGitflow((current) => ({
                  ...current,
                  ticketNumber: event.target.value,
                }))
              }
              disabled={disabled || submitting || !commandModeSupported}
              fullWidth
            />
          </Stack>
          <TextField
            label="Feature or bug description"
            value={gitflow.description}
            onChange={(event) =>
              setGitflow((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
            disabled={disabled || submitting || !commandModeSupported}
            multiline
            minRows={4}
            fullWidth
          />
        </Stack>
      ) : (
        <TextField
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder={
            placeholder ??
            getCommandPlaceholder(commandMode, gitflowContinuation)
          }
          disabled={disabled || submitting || !commandModeSupported}
          multiline
          minRows={3}
          fullWidth
        />
      )}
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: "center", justifyContent: "space-between" }}
      >
        {(error || !commandModeSupported) && (
          <Alert severity={error ? "error" : "info"} sx={{ flexGrow: 1 }}>
            {error ??
              getUnsupportedCommandModeMessage(
                commandMode,
                normalizedSkills,
                acceptedTaskTypes,
                noAcceptedTaskTypes,
              )}
          </Alert>
        )}
        <Button
          variant="contained"
          type="submit"
          startIcon={<SendIcon />}
          disabled={
            disabled ||
            submitting ||
            !commandModeSupported ||
            !canSubmit(commandMode, command, gitflow, gitflowContinuation)
          }
        >
          {submitting ? "Queueing" : "Queue command"}
        </Button>
      </Stack>
    </Stack>
  );
}

function normalizeEnabledTaskTypes(
  enabledTaskTypes: CommandMode[] | undefined,
): CommandMode[] {
  return enabledTaskTypes ?? ["ai", "shell", "gitflow"];
}

function isCommandModeSupported(
  commandMode: CommandMode,
  supportedSkills: string[],
  enabledTaskTypes: CommandMode[],
): boolean {
  if (!enabledTaskTypes.includes(commandMode)) return false;
  if (commandMode === "gitflow") return supportedSkills.includes("git");
  return true;
}

function getUnsupportedCommandModeMessage(
  commandMode: CommandMode,
  supportedSkills: string[],
  enabledTaskTypes: CommandMode[],
  noAcceptedTaskTypes: boolean,
): string {
  if (noAcceptedTaskTypes) return "This worker is not accepting commands.";
  if (!enabledTaskTypes.includes(commandMode))
    return `This worker does not accept ${formatCommandMode(commandMode)} tasks.`;
  if (commandMode === "gitflow" && !supportedSkills.includes("git"))
    return "Gitflow commands require the worker to advertise the git skill.";
  return "This command mode is not available for this worker.";
}

function formatCommandMode(commandMode: CommandMode): string {
  if (commandMode === "ai") return "AI";
  if (commandMode === "shell") return "Shell";
  return "Gitflow";
}

function canSubmit(
  commandMode: CommandMode,
  command: string,
  gitflow: GitflowForm,
  gitflowContinuation: boolean,
): boolean {
  if (commandMode !== "gitflow" || gitflowContinuation)
    return Boolean(command.trim());

  return Boolean(
    gitflow.repositoryUrl.trim() &&
    gitflow.sourceBranch.trim() &&
    gitflow.targetBranch.trim() &&
    gitflow.ticketNumber.trim() &&
    gitflow.description.trim(),
  );
}

function buildPayload(
  commandMode: CommandMode,
  command: string,
  gitflow: GitflowForm,
  gitflowContinuation: boolean,
): string | undefined {
  if (commandMode !== "gitflow" || gitflowContinuation)
    return command.trim() || undefined;

  if (!canSubmit(commandMode, command, gitflow, gitflowContinuation))
    return undefined;

  return JSON.stringify({
    repositoryUrl: gitflow.repositoryUrl.trim(),
    sourceBranch: gitflow.sourceBranch.trim(),
    targetBranch: gitflow.targetBranch.trim(),
    ticketNumber: gitflow.ticketNumber.trim(),
    description: gitflow.description.trim(),
  });
}

function getCommandPlaceholder(
  commandMode: CommandMode,
  gitflowContinuation: boolean,
): string {
  if (gitflowContinuation) return "Describe the PR follow-up or correction";
  if (commandMode === "ai") return "Ask the AI agent what to do";
  return "Enter a shell command";
}
